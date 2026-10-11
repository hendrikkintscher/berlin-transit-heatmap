import {
  addDays,
  isoDate,
  parseCalendarRow,
  pickReferenceDay,
  pickWeekendDay,
  ServiceCalendar,
} from './calendar.ts';
import { parseTime, readCsv } from './csv.ts';
import { BERLIN_BBOX, type BBox, forEachNearbyPair, inBBox } from './geo.ts';
import type { GtfsSource } from './source.ts';
import type { DayType, Mode, Route, Stop, StopsFile, Timetable, Transfer } from './types.ts';

export interface WindowSpec {
  name: string;
  /** Which reference day the window's times count from. */
  day: DayType;
  start: number;
  end: number;
}

/** Day 10:00–12:00 and night 02:00–04:00 of the following night (26:00–28:00 in GTFS terms). */
export const WINDOWS: WindowSpec[] = [
  { name: 'day', day: 'weekday', start: 10 * 3600, end: 12 * 3600 },
  { name: 'night', day: 'weekday', start: 26 * 3600, end: 28 * 3600 },
];

/**
 * One-hour windows for every hour of a weekday and of a Saturday, named e.g. "weekday-10"
 * or "weekend-02". Hours 00–04 of the Saturday are the Friday-to-Saturday night.
 */
export const HOURLY_WINDOWS: WindowSpec[] = (['weekday', 'weekend'] as const).flatMap((day) =>
  Array.from({ length: 24 }, (_, h) => ({
    name: hourlyName(day, h),
    day,
    start: h * 3600,
    end: (h + 1) * 3600,
  })),
);

export function hourlyName(day: DayType, hour: number): string {
  return `${day}-${String(hour).padStart(2, '0')}`;
}

/** Trips are kept if they depart within [start, end + TAIL] so trips started in the window can finish. */
export const WINDOW_TAIL_SECONDS = 2 * 3600;
export const WALK_SPEED_MPS = 1.2;
export const TRANSFER_RADIUS_M = 400;
export const TRANSFER_PENALTY_S = 60;
export const SAME_STATION_TRANSFER_S = 120;

export interface BuildOptions {
  bbox?: BBox;
  /** Overrides the feed version string (default: feed_info.txt, else the feed's file date). */
  feedVersion?: string;
  /** Overrides the reference day, YYYY-MM-DD. */
  serviceDate?: string;
  /** Also build the 48 one-hour windows (weekday and weekend). Default false. */
  hourly?: boolean;
  log?: (message: string) => void;
}

export interface WindowStats {
  routes: number;
  trips: number;
  stopTimes: number;
  transfers: number;
}

export interface BuildResult {
  /** "day", "night" and, when built, the hourly windows such as "weekday-10". */
  timetables: Record<string, Timetable>;
  stopsFile: StopsFile;
  stats: {
    serviceDate: string;
    /** The Saturday used for the weekend windows. */
    weekendDate: string;
    feedVersion: string;
    stops: number;
    stations: number;
    windows: Record<string, WindowStats>;
  };
}

interface RawStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isStation: boolean;
  parentId: string;
  inside: boolean;
}

interface TripRows {
  routeId: string;
  serviceId: string;
  seq: number[];
  stop: number[];
  time: number[];
}

interface CandidateTrip {
  routeId: string;
  stops: number[]; // raw stop indices
  times: number[];
}

export function modeOf(routeType: number): Mode {
  if (routeType === 0 || (routeType >= 900 && routeType < 1000)) return 'tram';
  if (routeType === 1 || (routeType >= 400 && routeType < 500)) return 'ubahn';
  if (routeType === 109) return 'sbahn';
  if (routeType === 2 || (routeType >= 100 && routeType < 200)) return 'regional';
  if (
    routeType === 3 ||
    routeType === 11 ||
    (routeType >= 200 && routeType < 300) ||
    (routeType >= 700 && routeType < 900)
  )
    return 'bus';
  if (routeType === 4 || (routeType >= 1000 && routeType < 1100) || routeType === 1200)
    return 'ferry';
  return 'other';
}

export async function buildTimetables(
  source: GtfsSource,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const bbox = options.bbox ?? BERLIN_BBOX;
  const log = options.log ?? (() => {});

  // --- stops -------------------------------------------------------------
  const rawStops: RawStop[] = [];
  const stopIndex = new Map<string, number>();
  await readCsv(await source.open('stops.txt'), (get) => {
    const lat = Number(get('stop_lat'));
    const lon = Number(get('stop_lon'));
    const locationType = get('location_type');
    stopIndex.set(get('stop_id'), rawStops.length);
    rawStops.push({
      id: get('stop_id'),
      name: get('stop_name'),
      lat,
      lon,
      isStation: locationType === '1',
      parentId: get('parent_station'),
      inside: inBBox(bbox, lat, lon),
    });
  });
  log(`stops.txt: ${rawStops.length} rows`);

  // --- routes ------------------------------------------------------------
  const routes = new Map<string, { name: string; mode: Mode }>();
  await readCsv(await source.open('routes.txt'), (get) => {
    routes.set(get('route_id'), {
      name: get('route_short_name') || get('route_long_name') || get('route_id'),
      mode: modeOf(Number(get('route_type'))),
    });
  });

  // --- calendar ----------------------------------------------------------
  const calendar = new ServiceCalendar();
  if (source.has('calendar.txt'))
    await readCsv(await source.open('calendar.txt'), (get) =>
      calendar.addCalendar(parseCalendarRow(get)),
    );
  if (source.has('calendar_dates.txt'))
    await readCsv(await source.open('calendar_dates.txt'), (get) =>
      calendar.addException({
        serviceId: get('service_id'),
        date: get('date'),
        exceptionType: Number(get('exception_type')),
      }),
    );
  const serviceDay = options.serviceDate
    ? options.serviceDate.replaceAll('-', '')
    : pickReferenceDay(calendar.startDate());
  const weekendDay = pickWeekendDay(serviceDay);
  const days: Record<DayType, string> = { weekday: serviceDay, weekend: weekendDay };
  const windows = options.hourly ? [...WINDOWS, ...HOURLY_WINDOWS] : WINDOWS;
  // Trips of the previous and next service day can run inside our windows
  // (e.g. the night window is also served by next-day trips at 02:00–04:00).
  const dayOffsets = [-1, 0, 1];
  const activeByDay = {
    weekday: dayOffsets.map((o) => calendar.activeServices(addDays(serviceDay, o))),
    weekend: dayOffsets.map((o) => calendar.activeServices(addDays(weekendDay, o))),
  };
  const usedDays = new Set(windows.map((w) => w.day));
  const anyActive = (serviceId: string) =>
    [...usedDays].some((d) => activeByDay[d].some((set) => set.has(serviceId)));
  log(
    `reference days ${isoDate(serviceDay)} (weekday), ${isoDate(weekendDay)} (weekend); active services ${activeByDay.weekday[1]!.size}`,
  );

  let feedVersion = options.feedVersion ?? '';
  if (!feedVersion && source.has('feed_info.txt')) {
    await readCsv(await source.open('feed_info.txt'), (get) => {
      feedVersion ||= get('feed_version') || get('feed_start_date');
    });
  }
  feedVersion ||= source.modifiedDate();

  // --- trips -------------------------------------------------------------
  const trips = new Map<string, TripRows>();
  await readCsv(await source.open('trips.txt'), (get) => {
    const serviceId = get('service_id');
    if (!anyActive(serviceId)) return;
    if (!routes.has(get('route_id'))) return;
    trips.set(get('trip_id'), {
      routeId: get('route_id'),
      serviceId,
      seq: [],
      stop: [],
      time: [],
    });
  });
  log(`trips active around the reference day: ${trips.size}`);

  // --- stop_times (large: streamed, only in-bbox rows of active trips kept) ---
  const stopTimeRows = await readCsv(await source.open('stop_times.txt'), (get) => {
    const trip = trips.get(get('trip_id'));
    if (!trip) return;
    const s = stopIndex.get(get('stop_id'));
    if (s === undefined || !rawStops[s]!.inside) return;
    if (get('pickup_type') === '1' && get('drop_off_type') === '1') return;
    let t = parseTime(get('departure_time'));
    if (Number.isNaN(t)) t = parseTime(get('arrival_time'));
    trip.seq.push(Number(get('stop_sequence')));
    trip.stop.push(s);
    trip.time.push(t);
  });
  log(`stop_times.txt: ${stopTimeRows} rows`);

  const ordered: TripRows[] = [];
  for (const trip of trips.values()) {
    if (trip.stop.length < 2) continue;
    sortTripRows(trip);
    if (fillTimes(trip.time)) ordered.push(trip);
  }
  trips.clear();

  // --- per-window routes -------------------------------------------------
  const windowRoutes = new Map<string, { routeId: string; stops: number[]; trips: number[][] }[]>();
  for (const w of windows) {
    const activeByOffset = activeByDay[w.day];
    const candidates: CandidateTrip[] = [];
    const seen = new Set<string>();
    for (const trip of ordered) {
      dayOffsets.forEach((offset, k) => {
        if (!activeByOffset[k]!.has(trip.serviceId)) return;
        const shift = offset * 86400;
        // Times are non-decreasing, so the first and last bound the trip.
        const first = trip.time[0]! + shift;
        const last = trip.time.at(-1)! + shift;
        if (last < w.start || first > w.end + WINDOW_TAIL_SECONDS) return;
        const times = trip.time.map((t) => t + shift);
        const key = `${trip.stop.join(',')}|${times.join(',')}`;
        if (seen.has(key)) return; // duplicate trip
        seen.add(key);
        candidates.push({ routeId: trip.routeId, stops: trip.stop, times });
      });
    }
    windowRoutes.set(w.name, groupIntoRoutes(candidates));
  }

  // --- shared stop list --------------------------------------------------
  const served = new Set<number>();
  for (const list of windowRoutes.values())
    for (const r of list) for (const s of r.stops) served.add(s);
  const parentOf = (s: number): number | undefined => {
    const p = rawStops[s]!.parentId ? stopIndex.get(rawStops[s]!.parentId) : undefined;
    return p !== undefined && rawStops[p]!.isStation ? p : undefined;
  };
  const included = new Set(served);
  for (const s of served) {
    const p = parentOf(s);
    if (p !== undefined) included.add(p);
  }
  // Group platforms next to their station for locality; deterministic order by id.
  const groupKey = (s: number) => rawStops[parentOf(s) ?? s]!.id;
  const order = [...included].sort((a, b) => {
    const ga = groupKey(a);
    const gb = groupKey(b);
    if (ga !== gb) return ga < gb ? -1 : 1;
    if (rawStops[a]!.isStation !== rawStops[b]!.isStation) return rawStops[a]!.isStation ? -1 : 1;
    return rawStops[a]!.id < rawStops[b]!.id ? -1 : 1;
  });
  const newIndex = new Map(order.map((s, i) => [s, i]));
  const stops: Stop[] = order.map((s) => {
    const raw = rawStops[s]!;
    const stop: Stop = { id: raw.id, name: raw.name, lat: round5(raw.lat), lon: round5(raw.lon) };
    const p = parentOf(s);
    if (p !== undefined) stop.parent = newIndex.get(p)!;
    return stop;
  });

  // --- transfers (shared by both windows) --------------------------------
  const transfers = await buildTransfers(source, rawStops, stopIndex, served, parentOf, newIndex);

  // --- assemble ----------------------------------------------------------
  const timetables: Record<string, Timetable> = {};
  const windowStats: Record<string, WindowStats> = {};
  for (const w of windows) {
    const list = windowRoutes.get(w.name)!;
    const out: Route[] = list.map((r) => ({
      name: routes.get(r.routeId)!.name,
      mode: routes.get(r.routeId)!.mode,
      stops: r.stops.map((s) => newIndex.get(s)!),
      trips: r.trips,
    }));
    timetables[w.name] = {
      version: 1,
      window: w.name,
      serviceDate: isoDate(days[w.day]),
      windowStart: w.start,
      windowEnd: w.end,
      feedVersion,
      stops,
      routes: out,
      transfers,
    };
    windowStats[w.name] = {
      routes: out.length,
      trips: out.reduce((n, r) => n + r.trips.length, 0),
      stopTimes: out.reduce((n, r) => n + r.trips.length * r.stops.length, 0),
      transfers: transfers.length,
    };
  }

  return {
    timetables,
    stopsFile: { version: 1, serviceDate: isoDate(serviceDay), feedVersion, stops },
    stats: {
      serviceDate: isoDate(serviceDay),
      weekendDate: isoDate(weekendDay),
      feedVersion,
      stops: stops.length,
      stations: stops.length - served.size,
      windows: windowStats,
    },
  };
}

function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}

function sortTripRows(trip: TripRows): void {
  let sorted = true;
  for (let i = 1; i < trip.seq.length; i++) if (trip.seq[i]! < trip.seq[i - 1]!) sorted = false;
  if (sorted) return;
  const idx = trip.seq.map((_, i) => i).sort((a, b) => trip.seq[a]! - trip.seq[b]!);
  trip.seq = idx.map((i) => trip.seq[i]!);
  trip.stop = idx.map((i) => trip.stop[i]!);
  trip.time = idx.map((i) => trip.time[i]!);
}

/**
 * Interpolates missing times between known ones and makes times non-decreasing.
 * Returns false if the trip has fewer than two known times.
 */
export function fillTimes(times: number[]): boolean {
  const known = times.flatMap((t, i) => (Number.isNaN(t) ? [] : [i]));
  if (known.length < 2) return false;
  for (let k = 0; k < known.length - 1; k++) {
    const a = known[k]!;
    const b = known[k + 1]!;
    for (let i = a + 1; i < b; i++)
      times[i] = Math.round(times[a]! + ((times[b]! - times[a]!) * (i - a)) / (b - a));
  }
  // Leading/trailing unknowns: copy the nearest known time.
  for (let i = 0; i < known[0]!; i++) times[i] = times[known[0]!]!;
  for (let i = known.at(-1)! + 1; i < times.length; i++) times[i] = times[known.at(-1)!]!;
  for (let i = 1; i < times.length; i++) if (times[i]! < times[i - 1]!) times[i] = times[i - 1]!;
  return true;
}

/**
 * Groups trips by (GTFS route, identical stop sequence) and splits each group
 * so that no trip overtakes another, as RAPTOR requires.
 */
export function groupIntoRoutes(
  candidates: CandidateTrip[],
): { routeId: string; stops: number[]; trips: number[][] }[] {
  const groups = new Map<string, CandidateTrip[]>();
  for (const c of candidates) {
    const key = `${c.routeId}|${c.stops.join(',')}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }
  const result: { routeId: string; stops: number[]; trips: number[][] }[] = [];
  const keys = [...groups.keys()].sort();
  for (const key of keys) {
    const group = groups.get(key)!;
    group.sort((a, b) => {
      for (let i = 0; i < a.times.length; i++)
        if (a.times[i] !== b.times[i]) return a.times[i]! - b.times[i]!;
      return 0;
    });
    const subRoutes: number[][][] = [];
    for (const trip of group) {
      const target = subRoutes.find((sub) => {
        const last = sub.at(-1)!;
        return last.every((t, i) => t <= trip.times[i]!);
      });
      if (target) target.push(trip.times);
      else subRoutes.push([trip.times]);
    }
    for (const sub of subRoutes)
      result.push({ routeId: group[0]!.routeId, stops: group[0]!.stops, trips: sub });
  }
  return result;
}

async function buildTransfers(
  source: GtfsSource,
  rawStops: RawStop[],
  stopIndex: Map<string, number>,
  served: Set<number>,
  parentOf: (s: number) => number | undefined,
  newIndex: Map<number, number>,
): Promise<Transfer[]> {
  const seconds = new Map<string, number>(); // "from,to" in new indices
  const set = (a: number, b: number, s: number) => seconds.set(`${a},${b}`, s);
  const servedList = [...served];
  const points = servedList.map((s) => rawStops[s]!);

  // Walking between nearby stops.
  forEachNearbyPair(points, TRANSFER_RADIUS_M, (i, j, metres) => {
    const s = Math.round(metres / WALK_SPEED_MPS + TRANSFER_PENALTY_S);
    const a = newIndex.get(servedList[i]!)!;
    const b = newIndex.get(servedList[j]!)!;
    set(a, b, s);
    set(b, a, s);
  });

  // Platforms of the same station: at most SAME_STATION_TRANSFER_S apart.
  const byStation = new Map<number, number[]>();
  for (const s of servedList) {
    const p = parentOf(s);
    if (p === undefined) continue;
    const list = byStation.get(p);
    if (list) list.push(newIndex.get(s)!);
    else byStation.set(p, [newIndex.get(s)!]);
  }
  for (const list of byStation.values())
    for (const a of list)
      for (const b of list) {
        if (a === b) continue;
        const current = seconds.get(`${a},${b}`);
        if (current === undefined || current > SAME_STATION_TRANSFER_S)
          set(a, b, SAME_STATION_TRANSFER_S);
      }

  // GTFS transfers.txt with a minimum transfer time and no route/trip restriction.
  if (source.has('transfers.txt')) {
    const given = new Map<string, number>();
    await readCsv(await source.open('transfers.txt'), (get) => {
      if (get('transfer_type') !== '2' || get('min_transfer_time') === '') return;
      if (get('from_route_id') || get('to_route_id') || get('from_trip_id') || get('to_trip_id'))
        return;
      const from = stopIndex.get(get('from_stop_id'));
      const to = stopIndex.get(get('to_stop_id'));
      if (from === undefined || to === undefined || from === to) return;
      if (!served.has(from) || !served.has(to)) return;
      given.set(`${newIndex.get(from)},${newIndex.get(to)}`, Number(get('min_transfer_time')));
    });
    for (const [key, s] of given) seconds.set(key, s);
    // Keep both directions present when the feed only lists one.
    for (const [key, s] of given) {
      const [a, b] = key.split(',');
      if (!seconds.has(`${b},${a}`)) seconds.set(`${b},${a}`, s);
    }
  }

  const transfers: Transfer[] = [];
  for (const [key, s] of seconds) {
    const [from, to] = key.split(',').map(Number) as [number, number];
    transfers.push({ from, to, seconds: s });
  }
  transfers.sort((x, y) => x.from - y.from || x.to - y.to);
  return transfers;
}
