// Search suggestions that need no network: stations of the loaded timetable, favourite
// places and recent searches. They show on the first keystroke; Photon's addresses join
// below them when they arrive (see main.ts).
import { regionKey } from './region';
import type { Place } from './search';

export interface LocalPlace extends Place {
  kind: 'recent' | 'favourite' | 'station';
  /** Stations: departures per hour, to put busy ones first. */
  weight?: number;
}

const RECENT_MAX = 8;

/** Lower case, no accents, ß as ss, "straße" as "str", so "Muller" finds "Müllerstr.". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/strasse\b/g, 'str')
    .replace(/str\./g, 'str');
}

/** Word starts of a name, for prefix matching ("S+U Alexanderplatz" -> s, u, alexanderplatz). */
const words = (s: string) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * How well `name` matches the query: 2 when the name starts with it, 1 when every query
 * word starts a word of the name, 0 otherwise.
 */
export function matchScore(name: string, query: string): number {
  const q = fold(query).trim();
  if (!q) return 0;
  const f = fold(name);
  if (f.startsWith(q) || f.replace(/^[su]\+?u?\s+/, '').startsWith(q)) return 2;
  const nw = words(name);
  const qw = words(query);
  return qw.length && qw.every((w) => nw.some((n) => n.startsWith(w))) ? 1 : 0;
}

/**
 * Up to `limit` local suggestions: recent searches and favourites first, then stations
 * (best match, then busiest). An empty query lists the recent searches.
 */
export function localMatches(query: string, pool: LocalPlace[], limit = 4): LocalPlace[] {
  const q = query.trim();
  if (!q) return pool.filter((p) => p.kind === 'recent').slice(0, limit);
  const order = { recent: 0, favourite: 1, station: 2 };
  const kept: { key: string; p: LocalPlace }[] = [];
  return pool
    .map((p) => ({ p, s: matchScore(p.label, q) }))
    .filter((x) => x.s > 0)
    .sort(
      (a, b) =>
        order[a.p.kind] - order[b.p.kind] ||
        b.s - a.s ||
        (b.p.weight ?? 0) - (a.p.weight ?? 0) ||
        a.p.label.localeCompare(b.p.label, 'de'),
    )
    .map((x) => x.p)
    .filter((p) => {
      // One row per place: "S+U Alexanderplatz Bhf", its tram stop "U Alexanderplatz" and
      // "…Bhf/Gontardstr." are the same stop to someone searching.
      const key = core(p.label);
      if (kept.some((k) => k.key === key && near(k.p, p))) return false;
      kept.push({ key, p });
      return true;
    })
    .slice(0, limit);
}

/** A station name without S/U prefix, "Bhf" and a "/street" suffix. */
const core = (name: string) =>
  fold(name)
    .replace(/^(s\+u|s|u)\s+/, '')
    .replace(/\s+bhf\b.*$/, '')
    .replace(/\/.*$/, '')
    .trim();

/** Within about 300 m. */
const near = (a: Place, b: Place) =>
  Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lon - b.lon) < 0.0045;

/** Photon's results without the places already listed locally (same name, within 300 m). */
export function withoutLocal(remote: Place[], local: Place[]): Place[] {
  return remote.filter(
    (r) =>
      // A street is not the stop named after it.
      !!r.street ||
      !local.some(
        (l) => (fold(l.label) === fold(r.label) || core(l.label) === core(r.label)) && near(l, r),
      ),
  );
}

export function loadRecent(): LocalPlace[] {
  try {
    const list = JSON.parse(localStorage.getItem(regionKey('recentPlaces')) ?? '[]') as Place[];
    return list.map((p) => ({ ...p, kind: 'recent' as const }));
  } catch {
    return [];
  }
}

/** Remembers a picked place, newest first. */
export function rememberRecent(p: Place): void {
  try {
    const list = loadRecent().filter((r) => fold(r.label) !== fold(p.label));
    const next = [{ label: p.label, detail: p.detail, lat: p.lat, lon: p.lon }, ...list];
    localStorage.setItem(
      regionKey('recentPlaces'),
      JSON.stringify(
        next
          .slice(0, RECENT_MAX)
          .map(({ label, detail, lat, lon }) => ({ label, detail, lat, lon })),
      ),
    );
  } catch {
    // Private mode: no recent searches.
  }
}
