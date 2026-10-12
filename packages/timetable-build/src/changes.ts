// "What's different today": compares each real date with the usual pattern of the
// following weeks and lists the U-Bahn, S-Bahn and tram lines that skip stations or do not
// run, with the stretch for the map and how long it lasts (as far as the feed says).

import { addDays, isBerlinHoliday, isoDate, toDate } from './calendar.ts';
import type { Mode } from './types.ts';

/** Modes the notice watches; buses change too often to be worth a notice. */
export const WATCHED_MODES: readonly Mode[] = ['ubahn', 'sbahn', 'tram'];
/** How far ahead the usual pattern is taken from, and how far "until" can reach. */
export const HORIZON_DAYS = 56;

export interface WatchedTrip {
  /** Line key: agency and short name, e.g. "796|U2". */
  line: string;
  serviceId: string;
  /** Station indices in travel order (parent stations where there are any). */
  stations: number[];
  /** A bus with the line's name: rail replacement (Ersatzverkehr). */
  replacement: boolean;
}

export interface LineInfo {
  name: string;
  mode: Mode;
}

export interface StationInfo {
  name: string;
  lat: number;
  lon: number;
}

export type ChangeKind = 'off' | 'gap' | 'skip';

export interface Change {
  line: string;
  mode: Mode;
  /** off: the line does not run; gap: a stretch is not served; skip: one station is not served. */
  kind: ChangeKind;
  /** Buses with the line's name run that day. */
  replacement: boolean;
  /** For a gap the last stations still served on either side (or the end of the missing stretch). */
  from: string;
  to: string;
  /** Last day of the change (YYYY-MM-DD), when it ends within the horizon the feed covers. */
  until?: string;
  /** [lon, lat] of the stretch, from the station before to the station after. */
  path: [number, number][];
  /** First and last index in `path` of the stations not served. */
  gone: [number, number];
}

export interface ChangesFile {
  version: 1;
  feedVersion: string;
  /** Per date (YYYYMMDD) the lines that run differently, U-Bahn first. */
  days: Record<string, Change[]>;
}

/** Day kinds with the same usual pattern: Monday–Friday, Saturday, Sunday and holidays. */
export function dayClass(date: string): 'wd' | 'sa' | 'su' {
  const w = toDate(date).getUTCDay();
  if (w === 0 || isBerlinHoliday(date)) return 'su';
  return w === 6 ? 'sa' : 'wd';
}

interface Pattern {
  stations: number[];
  services: Set<string>;
}

const MODE_ORDER: Mode[] = ['ubahn', 'sbahn', 'tram'];

export function findChanges(input: {
  trips: WatchedTrip[];
  lines: Map<string, LineInfo>;
  stations: (i: number) => StationInfo;
  isActive: (serviceId: string, date: string) => boolean;
  /** The dates to report on (YYYYMMDD); the first is today. */
  dates: readonly string[];
  /** Last date the feed has service for (YYYYMMDD). */
  feedEnd: string;
}): Record<string, Change[]> {
  const { trips, lines, stations, isActive, dates, feedEnd } = input;
  if (!dates.length) return {};

  // Distinct station sequences per line, with the services that run them.
  const rail = new Map<string, Map<string, Pattern>>();
  const buses = new Map<string, Set<string>>(); // line -> services of its replacement buses
  for (const trip of trips) {
    if (trip.replacement) {
      let set = buses.get(trip.line);
      if (!set) buses.set(trip.line, (set = new Set()));
      set.add(trip.serviceId);
      continue;
    }
    if (trip.stations.length < 2) continue;
    let patterns = rail.get(trip.line);
    if (!patterns) rail.set(trip.line, (patterns = new Map()));
    const key = trip.stations.join(',');
    let p = patterns.get(key);
    if (!p) patterns.set(key, (p = { stations: trip.stations, services: new Set() }));
    p.services.add(trip.serviceId);
  }

  const horizon: string[] = [];
  for (let d = dates[0]!, i = 0; i < HORIZON_DAYS && d <= feedEnd; i++, d = addDays(d, 1))
    horizon.push(d);
  for (const d of dates) if (!horizon.includes(d)) horizon.push(d);
  horizon.sort();

  // Which services run on a date, cached: isActive is called for each line and day.
  const activeCache = new Map<string, Map<string, boolean>>();
  const active = (serviceId: string, date: string) => {
    let byDate = activeCache.get(date);
    if (!byDate) activeCache.set(date, (byDate = new Map()));
    let a = byDate.get(serviceId);
    if (a === undefined) byDate.set(serviceId, (a = isActive(serviceId, date)));
    return a;
  };
  const runs = (services: Set<string>, date: string) => [...services].some((s) => active(s, date));
  const served = (patterns: Map<string, Pattern>, date: string) => {
    const set = new Set<number>();
    for (const p of patterns.values())
      if (runs(p.services, date)) for (const s of p.stations) set.add(s);
    return set;
  };

  const result: Record<string, Change[]> = {};
  for (const d of dates) result[d] = [];

  for (const [line, patterns] of rail) {
    const info = lines.get(line);
    if (!info) continue;
    const servedOn = new Map(horizon.map((d) => [d, served(patterns, d)]));
    // Usually served: on more than half of the horizon's days of the same kind.
    const usual = new Map<string, Set<number>>();
    for (const cls of ['wd', 'sa', 'su'] as const) {
      const days = horizon.filter((d) => dayClass(d) === cls);
      const count = new Map<number, number>();
      for (const d of days) for (const s of servedOn.get(d)!) count.set(s, (count.get(s) ?? 0) + 1);
      usual.set(cls, new Set([...count].filter(([, n]) => n * 2 > days.length).map(([s]) => s)));
    }

    for (const date of dates) {
      const expected = usual.get(dayClass(date))!;
      if (expected.size < 2) continue;
      const today = servedOn.get(date)!;
      const missing = new Set([...expected].filter((s) => !today.has(s)));
      if (!missing.size) continue;
      const replacement = runs(buses.get(line) ?? new Set(), date);
      // Last day within the horizon on which none of these stations are served again.
      const until = (gone: number[]) => {
        let last = date;
        for (const d of horizon) {
          if (d <= date) continue;
          if (gone.some((s) => servedOn.get(d)!.has(s))) return isoDate(last);
          last = d;
        }
        return undefined; // past what the feed covers
      };
      const point = (s: number): [number, number] => [stations(s).lon, stations(s).lat];

      if (missing.size === expected.size) {
        const longest = [...patterns.values()]
          .map((p) => p.stations.filter((s) => expected.has(s)))
          .reduce((a, b) => (b.length > a.length ? b : a));
        result[date]!.push({
          line: info.name,
          mode: info.mode,
          kind: 'off',
          replacement,
          from: stations(longest[0]!).name,
          to: stations(longest.at(-1)!).name,
          ...optional('until', until([...missing])),
          path: longest.map(point),
          gone: [0, longest.length - 1],
        });
        continue;
      }

      // Stretches: runs of missing stations along each pattern, with a served station on
      // either side where there is one.
      const stretches: {
        gone: number[];
        path: number[];
        ends: [number, number];
        at: number;
      }[] = [];
      for (const p of patterns.values()) {
        const st = p.stations.filter((s) => expected.has(s));
        for (let i = 0; i < st.length; i++) {
          if (!missing.has(st[i]!)) continue;
          let j = i;
          while (j + 1 < st.length && missing.has(st[j + 1]!)) j++;
          const a = Math.max(0, i - 1);
          const b = Math.min(st.length - 1, j + 1);
          stretches.push({
            gone: st.slice(i, j + 1),
            path: st.slice(a, b + 1),
            ends: [st[a]!, st[b]!],
            at: i - a,
          });
          i = j;
        }
      }
      // The longest run wins over the runs that overlap it (the other direction, branches).
      const kept: typeof stretches = [];
      for (const x of [...stretches].sort((p, q) => q.gone.length - p.gone.length))
        if (!kept.some((y) => x.gone.some((s) => y.gone.includes(s)))) kept.push(x);
      for (const s of kept) {
        const single = s.gone.length === 1 && s.path.length === 3;
        result[date]!.push({
          line: info.name,
          mode: info.mode,
          kind: single ? 'skip' : 'gap',
          replacement,
          from: stations(single ? s.gone[0]! : s.ends[0]).name,
          to: stations(single ? s.gone[0]! : s.ends[1]).name,
          ...optional('until', until(s.gone)),
          path: s.path.map(point),
          gone: [s.at, s.at + s.gone.length - 1],
        });
      }
    }
  }

  const natural = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true });
  for (const list of Object.values(result))
    list.sort(
      (a, b) =>
        MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode) ||
        natural(a.line, b.line) ||
        natural(a.from, b.from),
    );
  return result;
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
