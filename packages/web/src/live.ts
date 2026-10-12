// Live status of the first vehicle on the tap card: is it on time, late or cancelled?
// VBB's real-time feed (GTFS-RT) is several megabytes and carries no notices, so the app
// asks VBB's journey API (v6.vbb.transport.rest, the open HAFAS proxy) for the departures
// at the stop just around that time: one small request after the card is shown, never
// before it. Without an answer the card simply shows no live line.

import { t } from './i18n';

const API = 'https://v6.vbb.transport.rest';
const TIMEOUT_MS = 6000;

export interface Board {
  /** Stop index in the timetable (its VBB station number comes from stop-ids.json). */
  stop: number;
  line: string;
  /** Planned departure, seconds of the service day. */
  at: number;
}

export type LiveStatus = { cancelled: true } | { cancelled: false; delay: number };

let stationIds: Promise<number[] | null> | null = null;

/** VBB station numbers by stop index (900100003 for Alexanderplatz), loaded on first use. */
function stationId(dataBase: string, stop: number): Promise<number | null> {
  stationIds ??= fetch(new URL('stop-ids.json', dataBase))
    .then((r) => (r.ok ? (r.json() as Promise<{ ids?: number[] }>) : null))
    .then((f) => f?.ids ?? null)
    .catch(() => (stationIds = null));
  return stationIds.then((ids) => ids?.[stop] || null);
}

/** The moment `seconds` after midnight of a Berlin date (YYYYMMDD), DST included. */
export function berlinTime(day: string, seconds: number): Date {
  const [y, m, d] = [+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)];
  const guess = Date.UTC(y, m, d) + seconds * 1000;
  // Berlin's offset at that moment, from how Berlin's clock shows it.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(guess));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return new Date(guess - (shown - guess));
}

interface Departure {
  plannedWhen: string | null;
  delay: number | null;
  cancelled?: boolean;
  line?: { name?: string };
}

/** The status of the departure of `line` planned at `when`, from the API's list. */
export function pickStatus(deps: Departure[], line: string, when: Date): LiveStatus | null {
  const d = deps.find(
    (x) =>
      x.line?.name === line &&
      x.plannedWhen !== null &&
      Math.abs(Date.parse(x.plannedWhen) - when.getTime()) < 60_000,
  );
  if (!d) return null;
  if (d.cancelled) return { cancelled: true };
  return d.delay === null ? null : { cancelled: false, delay: d.delay };
}

/** Asks the API; null when it has no live data for that departure or does not answer. */
export async function liveStatus(
  board: Board,
  day: string,
  dataBase: string,
): Promise<LiveStatus | null> {
  const id = await stationId(dataBase, board.stop);
  if (!id) return null;
  const when = berlinTime(day, board.at);
  const q = new URLSearchParams({
    when: new Date(when.getTime() - 60_000).toISOString(),
    duration: '5',
    results: '40',
    remarks: 'false',
    linesOfStops: 'false',
    language: 'de',
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/stops/${id}/departures?${q}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { departures?: Departure[] } | Departure[];
    const deps = Array.isArray(body) ? body : (body.departures ?? []);
    return pickStatus(deps, board.line, when);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "U8 fällt aus", "U8 +4 Min.", "U8 pünktlich". */
export function liveText(line: string, s: LiveStatus): { text: string; bad: boolean } {
  if (s.cancelled) return { text: t('liveCancelled', { line }), bad: true };
  const late = Math.round(s.delay / 60);
  if (late >= 1) return { text: t('liveLate', { line, n: late }), bad: late >= 3 };
  return { text: t('liveOnTime', { line }), bad: false };
}
