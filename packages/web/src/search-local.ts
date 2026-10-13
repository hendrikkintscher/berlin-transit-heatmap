// Search suggestions that need no network: stations of the loaded timetable, the region's
// streets (streets.json from the timetable build), favourite places and recent searches.
// They show on the first keystroke; Photon's addresses join below them when they arrive
// (see main.ts).
import { regionKey } from './region';
import type { Place } from './search';

export interface LocalPlace extends Place {
  kind: 'recent' | 'favourite' | 'station' | 'street';
  /** Stations: departures per hour, to put busy ones first. */
  weight?: number;
}

const RECENT_MAX = 8;

/**
 * Lower case, no accents, ß as ss, "straße" as "str", so "Muller" finds "Müllerstr.";
 * "Hbf" and "Bhf" in full, so "Potsdam Hbf" finds "S Potsdam Hauptbahnhof".
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/strasse\b/g, 'str')
    .replace(/str\./g, 'str')
    .replace(/\bhbf\b\.?/g, 'hauptbahnhof')
    .replace(/\bbhf\b\.?/g, 'bahnhof');
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
  const order = { recent: 0, favourite: 1, station: 2, street: 3 };
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
    .replace(/\s+bahnhof\b.*$/, '')
    .replace(/\/.*$/, '')
    .trim();

/** Within about 300 m. */
const near = (a: Place, b: Place) =>
  Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lon - b.lon) < 0.0045;

/** Photon's results without the places already listed locally (same name, within 300 m). */
export function withoutLocal(remote: Place[], local: Place[]): Place[] {
  return remote.filter((r) =>
    r.street
      ? // A street is not the stop named after it, but it is the same street listed locally.
        !local.some((l) => l.street && sameStreet(l, r))
      : !local.some(
          (l) =>
            !l.street &&
            (fold(l.label) === fold(r.label) || core(l.label) === core(r.label)) &&
            near(l, r),
        ),
  );
}

/** Two rows for one street: the same name, within the 2 km the street list groups by. */
function sameStreet(a: Place, b: Place): boolean {
  return (
    fold(a.label) === fold(b.label) &&
    Math.abs(a.lat - b.lat) < 0.018 &&
    Math.abs(a.lon - b.lon) < 0.03
  );
}

/**
 * Local street rows with Photon's wording of the place where it has the same street
 * ("10119 Mitte" instead of "10119 Berlin").
 */
export function withRemoteDetail(local: LocalPlace[], remote: Place[]): LocalPlace[] {
  return local.map((l) => {
    const r = l.kind === 'street' ? remote.find((x) => x.street && sameStreet(l, x)) : undefined;
    return r?.detail ? { ...l, detail: r.detail } : l;
  });
}

/** A street of the list, with its name folded once for matching on every keystroke. */
export interface LocalStreet extends LocalPlace {
  folded: string;
  words: string[];
  /** Name and detail folded in one string: a quick first test for every keystroke. */
  text: string;
}

export interface StreetsFile {
  box: [number, number, number, number];
  streets: string;
}

/** Reads streets.json (see packages/timetable-build/src/streets.ts). */
export function parseStreets(file: StreetsFile): LocalStreet[] {
  return parseStreetLines(file.box, file.streets.split('\n'));
}

/** Towns and postcodes repeat thousands of times: each is folded once. */
const detailWords = new Map<string, string[]>();

/** Some lines of streets.json's `streets` (the app reads them a few at a time). */
export function parseStreetLines(box: StreetsFile['box'], lines: readonly string[]): LocalStreet[] {
  const [w, s] = box;
  const out: LocalStreet[] = [];
  for (const line of lines) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const name = line.slice(0, tab);
    const folded = fold(name);
    const nameWords = folded.split(/[^a-z0-9]+/).filter(Boolean);
    for (const point of line.slice(tab + 1).split(';')) {
      const [postcode = '', town = '', at = ''] = point.split('|');
      const comma = at.indexOf(',');
      const y = parseInt(at.slice(0, comma), 36);
      const x = parseInt(at.slice(comma + 1), 36);
      if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
      const detail = postcode && town ? `${postcode} ${town}` : postcode || town;
      let dw = detailWords.get(detail);
      if (!dw) detailWords.set(detail, (dw = words(detail)));
      out.push({
        kind: 'street',
        label: name,
        detail,
        lat: Math.round((s + y * 1e-4) * 1e4) / 1e4,
        lon: Math.round((w + x * 1e-4) * 1e4) / 1e4,
        street: postcode ? { name, postcode } : { name },
        folded,
        // "Hauptstraße 10317" and "Hauptstraße Potsdam" find it too.
        words: dw.length ? [...nameWords, ...dw] : nameWords,
        text: dw.length ? `${folded} ${dw.join(' ')}` : folded,
      });
    }
  }
  return out;
}

/**
 * Streets matching the query (as `matchScore`), best match first, then nearest to `at`, so
 * of twenty Hauptstraßen the ones around the map come first.
 */
export function streetMatches(
  query: string,
  streets: readonly LocalStreet[],
  at: { lat: number; lon: number },
  limit = 3,
): LocalStreet[] {
  const q = fold(query).trim();
  if (q.length < 3) return [];
  const qw = words(query);
  const kx = Math.cos((at.lat * Math.PI) / 180);
  const hits: { p: LocalStreet; s: number; d: number }[] = [];
  // Every match holds the query's longest word somewhere: most streets fail on that alone.
  const longest = qw.reduce((a, b) => (b.length > a.length ? b : a), '');
  for (const p of streets) {
    if (!p.text.includes(longest)) continue;
    const s = p.folded.startsWith(q)
      ? 2
      : qw.length && qw.every((w) => p.words.some((n) => n.startsWith(w)))
        ? 1
        : 0;
    if (s) hits.push({ p, s, d: Math.hypot(p.lat - at.lat, (p.lon - at.lon) * kx) });
  }
  return hits
    .sort((a, b) => b.s - a.s || a.d - b.d)
    .slice(0, limit)
    .map((h) => h.p);
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
