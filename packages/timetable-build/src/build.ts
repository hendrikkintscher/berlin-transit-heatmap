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
import { NETWORK_WALK_SPEED_MPS, WalkDistances, type WalkGraph } from './walk.ts';
import type { DayType, Mode, Route, Stop, StopsFile, Timetable, Transfer } from './types.ts';

export interface WindowSpec {
  name: string;
  /** Which day the window's times count from: a reference day, or a real date (YYYYMMDD). */
  day: DayType | string;
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

export function hourlyName(day: DayType | string, hour: number): string {
  return `${day}-${String(hour).padStart(2, '0')}`;
}

/** One-hour windows for every hour of each real date, named e.g. "20261012-10". */
export function datedWindows(dates: readonly string[]): WindowSpec[] {
  return dates.flatMap((day) =>
    Array.from({ length: 24 }, (_, h) => ({
      name: hourlyName(day, h),
      day,
      start: h * 3600,
      end: (h + 1) * 3600,
    })),
  );
}

/** Windows of a real date ("20261012-10") rather than a reference day. */
export const isDatedWindow = (name: string) => /^\d{8}-\d{2}$/.test(name);

/** Trips are kept if they depart within [start, end + TAIL] so trips started in the window can finish. */
export const WINDOW_TAIL_SECONDS = 2 * 3600;
export const WALK_SPEED_MPS = 1.2;
export const TRANSFER_RADIUS_M = 400;
export const TRANSFER_PENALTY_S = 60;
export const SAME_STATION_TRANSFER_S = 120;
/** Stops further than this from any footpath keep straight-line transfers. */
export const MAX_STOP_SNAP_M = 150;

export interface BuildOptions {
  bbox?: BBox;
  /** Overrides the feed version string (default: feed_info.txt, else the feed's file date). */
  feedVersion?: string;
  /** Overrides the reference day, YYYY-MM-DD. */
  serviceDate?: string;
  /** Also build the 48 one-hour windows (weekday and weekend). Default false. */
  hourly?: boolean;
  /**
   * Real dates (YYYYMMDD) to build all 24 one-hour windows for, so construction,
   * Ersatzverkehr and holidays show on the day they happen.
   */
  dates?: readonly string[];
  /** Walking network for transfer times; without it transfers use straight lines. */
  walk?: WalkGraph;
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
    /** Real dates (YYYY-MM-DD) with their own hourly windows. */
    dates: string[];
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
  locationType: string;
  isStation: boolean;
  parentId: string;
  inside: boolean;
}

interface TripRows {
  routeId: string;
  serviceId: string;
  /** GTFS wheelchair_accessible: '1' yes, '2' no, '0' or '' unknown. */
  access: string;
  seq: number[];
  stop: number[];
  time: number[];
}

interface CandidateTrip {
  routeId: string;
  /** Wheelchair-accessible; trips of one route are only grouped with the same value. */
  stepFree?: boolean;
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
      locationType,
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
  const days: Record<string, string> = { weekday: serviceDay, weekend: weekendDay };
  for (const date of options.dates ?? []) days[date] = date;
  const windows = [
    ...WINDOWS,
    ...(options.hourly ? HOURLY_WINDOWS : []),
    ...datedWindows(options.dates ?? []),
  ];
  // Trips of the previous and next service day can run inside our windows
  // (e.g. the night window is also served by next-day trips at 02:00–04:00).
  const dayOffsets = [-1, 0, 1];
  const usedDays = new Set(windows.map((w) => w.day));
  const activeByDay: Record<string, Set<string>[]> = {};
  for (const d of usedDays)
    activeByDay[d] = dayOffsets.map((o) => calendar.activeServices(addDays(days[d]!, o)));
  const anyActive = (serviceId: string) =>
    [...usedDays].some((d) => activeByDay[d]!.some((set) => set.has(serviceId)));
  log(
    `reference days ${isoDate(serviceDay)} (weekday), ${isoDate(weekendDay)} (weekend); active services ${activeByDay.weekday![1]!.size}${options.dates?.length ? `; dates ${options.dates.map(isoDate).join(', ')}` : ''}`,
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
      access: get('wheelchair_accessible'),
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

  // Step-free trips: marked accessible ('1'). A feed that says nothing counts as all step-free.
  const accessKnown = [...trips.values()].some((t) => t.access === '1' || t.access === '2');
  const tripStepFree = (t: TripRows) => !accessKnown || t.access === '1';

  const ordered: TripRows[] = [];
  for (const trip of trips.values()) {
    if (trip.stop.length < 2) continue;
    sortTripRows(trip);
    if (fillTimes(trip.time)) ordered.push(trip);
  }
  trips.clear();

  // --- per-window routes -------------------------------------------------
  const windowRoutes = new Map<
    string,
    { routeId: string; stops: number[]; trips: number[][]; stepFree?: boolean }[]
  >();
  for (const w of windows) {
    const activeByOffset = activeByDay[w.day]!;
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
        candidates.push({
          routeId: trip.routeId,
          stops: trip.stop,
          times,
          stepFree: tripStepFree(trip),
        });
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
  const notStepFree = source.has('pathways.txt')
    ? await stairsOnlyPlatforms(source, rawStops, stopIndex, parentOf)
    : new Set<number>();
  log(`platforms reached only by stairs or escalators: ${notStepFree.size}`);
  const stops: Stop[] = order.map((s) => {
    const raw = rawStops[s]!;
    const stop: Stop = { id: raw.id, name: raw.name, lat: round5(raw.lat), lon: round5(raw.lon) };
    const p = parentOf(s);
    if (p !== undefined) stop.parent = newIndex.get(p)!;
    if (notStepFree.has(s)) stop.stepFree = false;
    return stop;
  });

  // --- transfers (shared by both windows) --------------------------------
  const walk = options.walk ? new WalkDistances(options.walk) : undefined;
  const transfers = await buildTransfers(
    source,
    rawStops,
    stopIndex,
    served,
    parentOf,
    newIndex,
    walk,
  );

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
      ...(r.stepFree === false ? { stepFree: false as const } : {}),
    }));
    timetables[w.name] = {
      version: 1,
      window: w.name,
      serviceDate: isoDate(days[w.day]!),
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
      dates: (options.dates ?? []).map(isoDate),
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
): { routeId: string; stops: number[]; trips: number[][]; stepFree?: boolean }[] {
  const groups = new Map<string, CandidateTrip[]>();
  for (const c of candidates) {
    const key = `${c.routeId}|${c.stops.join(',')}|${c.stepFree === false ? 0 : 1}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }
  const result: { routeId: string; stops: number[]; trips: number[][]; stepFree?: boolean }[] = [];
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
      result.push({
        routeId: group[0]!.routeId,
        stops: group[0]!.stops,
        trips: sub,
        ...(group[0]!.stepFree === false ? { stepFree: false } : {}),
      });
  }
  return result;
}

/**
 * Platforms (raw stop indices) that pathways.txt connects to their station's entrances
 * only through stairs or escalators. Platforms without pathways, and stations without
 * entrances in the feed (street stops), count as step-free.
 */
export async function stairsOnlyPlatforms(
  source: GtfsSource,
  rawStops: RawStop[],
  stopIndex: Map<string, number>,
  parentOf: (s: number) => number | undefined,
): Promise<Set<number>> {
  const level = new Map<number, number[]>(); // step-free edges (no stairs 2, no escalator 4)
  const linked = new Set<number>();
  const edge = (a: number, b: number) => {
    const list = level.get(a);
    if (list) list.push(b);
    else level.set(a, [b]);
  };
  await readCsv(await source.open('pathways.txt'), (get) => {
    const a = stopIndex.get(get('from_stop_id'));
    const b = stopIndex.get(get('to_stop_id'));
    if (a === undefined || b === undefined) return;
    linked.add(a);
    linked.add(b);
    const mode = get('pathway_mode');
    if (mode === '2' || mode === '4') return;
    edge(a, b);
    if (get('is_bidirectional') === '1') edge(b, a);
  });
  const reached = new Set<number>();
  const stationsWithEntrances = new Set<number>();
  const queue: number[] = [];
  for (const s of linked) {
    if (rawStops[s]!.locationType !== '2') continue;
    reached.add(s);
    queue.push(s);
    const p = parentOf(s);
    if (p !== undefined) stationsWithEntrances.add(p);
  }
  while (queue.length) {
    for (const t of level.get(queue.pop()!) ?? []) {
      if (reached.has(t)) continue;
      reached.add(t);
      queue.push(t);
    }
  }
  const result = new Set<number>();
  for (const s of linked) {
    const raw = rawStops[s]!;
    if (raw.locationType !== '0' && raw.locationType !== '') continue;
    const p = parentOf(s);
    if (p !== undefined && stationsWithEntrances.has(p) && !reached.has(s)) result.add(s);
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
  walk: WalkDistances | undefined,
): Promise<Transfer[]> {
  const seconds = new Map<string, number>(); // "from,to" in new indices
  const set = (a: number, b: number, s: number) => seconds.set(`${a},${b}`, s);
  const servedList = [...served];
  const points = servedList.map((s) => rawStops[s]!);

  // Walking between nearby stops: on the footpath network when there is one (a pair
  // whose walk is more than twice the radius gets no transfer), else in a straight line.
  const pairs: [number, number, number][] = [];
  forEachNearbyPair(points, TRANSFER_RADIUS_M, (i, j, metres) => pairs.push([i, j, metres]));
  const snaps = walk ? points.map((p) => walk.snap(p.lat, p.lon, MAX_STOP_SNAP_M)) : [];
  const byFirst = new Map<number, [number, number][]>();
  for (const [i, j, metres] of pairs) {
    const list = byFirst.get(i);
    if (list) list.push([j, metres]);
    else byFirst.set(i, [[j, metres]]);
  }
  for (const [i, list] of byFirst) {
    const from = walk ? snaps[i] : null;
    const network =
      walk && from
        ? walk.distances(
            from,
            list.map(([j]) => snaps[j] ?? null),
            2 * TRANSFER_RADIUS_M,
          )
        : null;
    list.forEach(([j, metres], k) => {
      let s: number;
      if (network && snaps[j]) {
        if (network[k] === Infinity) return;
        s = Math.round(network[k]! / NETWORK_WALK_SPEED_MPS + TRANSFER_PENALTY_S);
      } else s = Math.round(metres / WALK_SPEED_MPS + TRANSFER_PENALTY_S);
      const a = newIndex.get(servedList[i]!)!;
      const b = newIndex.get(servedList[j]!)!;
      set(a, b, s);
      set(b, a, s);
    });
  }

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
