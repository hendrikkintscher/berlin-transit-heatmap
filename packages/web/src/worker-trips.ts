// Trips on tap: the connection to (or from) the tapped place, its rides' real times, the
// next few connections for the drawer, and the message the trip card is drawn from.
import {
  cellColRow,
  departureAt,
  distanceM,
  gridLayout,
  heatGrid,
  journeyTo,
  laterStart,
  NETWORK_WALK_SPEED_MPS,
  travelTimes,
  walkPath,
  type Journey,
  type PreparedTimetable,
  type TravelTimeResult,
} from '@berlin-transit-heatmap/routing';
import type { Direction, FromWorker, ToWorker, Travel, TripLeg } from './protocol';
import { stopName } from './stop-name';
import { course, walk } from './worker-paths';
import { CELL_M, cellSeconds, travelOptions, type Run } from './worker-runs';

/** The last computed map, as trips on tap need it. */
export interface LastTrip {
  tt: PreparedTimetable;
  runs: Run[];
  direction: Direction;
  travel: Travel;
  /** When trips on tap leave, if not with the map's own pass. */
  leaveAt: number | null;
  /** The moment trips on tap leave from (seconds of the service day), departing. */
  from: number;
}
/** The last computed map, kept for trip lookups on tap. */
let lastTrip: LastTrip | null = null;
export function setLastTrip(last: LastTrip) {
  lastTrip = last;
}

/** What a trip is rebuilt from; `seconds` is the trip's own time when it leaves now. */
type TripRun = Pick<Run, 'result' | 'best'> & { seconds?: number };

/**
 * What a trip on tap follows: the connection that arrives earliest when leaving now,
 * waiting for the departure included. With "Nächste" that is the map itself; otherwise a
 * single RAPTOR pass from now (once per map and start), and a grid around the tapped
 * place only, so a tap stays quick.
 */
function nowRun(last: LastTrip, r: Run, at: { lat: number; lon: number }): TripRun {
  if (last.leaveAt === null || last.travel === 'bikeonly') return r;
  const w = travelOptions(last.travel);
  const o = r.result.origin!;
  r.now ??= travelTimes(last.tt, o, { trackLegs: true, leaveAt: last.leaveAt, ...w });
  return nearRun(last.tt, r.now, at, w);
}

/** As nowRun, leaving at `last.leaveAt` instead of the map's moment; not kept. */
function laterRun(
  last: LastTrip & { leaveAt: number },
  r: Run,
  at: { lat: number; lon: number },
): TripRun {
  const w = travelOptions(last.travel);
  const result = travelTimes(last.tt, r.result.origin!, {
    trackLegs: true,
    leaveAt: last.leaveAt,
    ...w,
  });
  return nearRun(last.tt, result, at, w);
}

/** Cells computed each way around a tapped place for its trip. */
const NEAR_CELLS = 2;

/** A grid around `at` only (from the stops it can be walked or ridden to), for its trip. */
export function nearRun(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  at: { lat: number; lon: number },
  w: ReturnType<typeof travelOptions>,
): TripRun {
  // Only stops within the longest walk (or ride) from the place can be its last stop.
  const reachM = 2 * 900 * (w.walkSpeedMps ?? NETWORK_WALK_SPEED_MPS) + 100;
  const stopSeconds = Float32Array.from(result.stopSeconds);
  const stops = tt.stops;
  for (let s = 0; s < stopSeconds.length; s++)
    if (distanceM(at.lat, at.lon, stops[s].lat, stops[s].lon) > reachM) stopSeconds[s] = Infinity;
  // Only the cells around the place: its trip is read from its own cell.
  const layout = gridLayout({ cellSizeM: CELL_M });
  const [col, r0] = cellColRow(layout, at.lat, at.lon);
  const near = {
    c0: col - NEAR_CELLS,
    r0: r0 - NEAR_CELLS,
    cols: 2 * NEAR_CELLS + 1,
    rows: 2 * NEAR_CELLS + 1,
  };
  const best = heatGrid(
    tt,
    { ...result, stopSeconds },
    { cellSizeM: CELL_M, trackStops: true, window: near, ...w },
  );
  return { result, best, seconds: cellSeconds(best, at) };
}

/** The fastest journey to (or, arriving, from) the tapped spot, in travel order. */
export function trip(
  last: LastTrip,
  r: TripRun,
  at: { lat: number; lon: number },
): {
  journey: Journey;
  start: [number, number];
  end: [number, number];
  seconds?: number;
  /** When to leave the start and when the trip arrives (seconds of the day). */
  leave?: number;
  arrive?: number;
  /** Departing: the first vehicle, for its live status. */
  board?: { stop: number; line: string; at: number };
  /** Per leg: a ride's real times (null for walks). */
  clocks: (RideClock | null)[];
  /** The journey on the timetable's own clock and order (arriving: reversed), for more. */
  raw: Journey;
} | null {
  const found = journeyTo(last.tt, r.result, r.best, at.lat, at.lon);
  if (!found) return null;
  // Leaving, of two ways to the same onward connection the one leaving later or walking less.
  const access = r.result.legs?.rounds?.access;
  const j =
    last.direction === 'depart' && access ? laterStart(last.tt, found, access, last.from) : found;
  const seconds = r.seconds;
  const o = r.result.origin!;
  const here: [number, number] = [at.lon, at.lat];
  const point: [number, number] = [o.lon, o.lat];
  // Leaving from `from`, the trip arrives after the place's time (waiting included); the
  // walk to the first vehicle starts just in time for it. Arriving, the same holds on the
  // reversed timetable (its times are the real ones negated), from the destination back.
  const total = seconds ?? cellSeconds(r.best, at);
  let leave = last.from;
  let board: { stop: number; line: string; at: number } | undefined;
  const first = j.legs.findIndex((l) => l.type === 'ride');
  const ride = j.legs[first];
  if (ride?.type === 'ride') {
    const walkTo = j.legs
      .slice(0, first)
      .reduce((a, l) => a + (l.type === 'walk' ? l.seconds : 0), 0);
    const dep = departureAt(last.tt, ride.route, ride.fromPos, last.from + walkTo);
    if (dep !== null) {
      leave = Math.max(last.from, dep - walkTo);
      board = { stop: ride.from, line: ride.name, at: dep };
    }
  }
  const clocks = rideClocks(last.tt, j, last.from, last.direction === 'arrive');
  if (last.direction === 'depart')
    return {
      journey: j,
      start: point,
      end: here,
      seconds,
      leave,
      arrive: last.from + total,
      board,
      clocks,
      raw: j,
    };
  // Arriving: the tree runs backwards in time from the destination, so flip it.
  const legs = [...j.legs]
    .reverse()
    .map((l) =>
      l.type === 'ride' ? { ...l, from: l.to, to: l.from, stops: [...l.stops].reverse() } : l,
    );
  return {
    journey: { ...j, legs },
    start: here,
    end: point,
    seconds,
    leave: -(last.from + total),
    arrive: -leave,
    clocks: clocks.reverse(),
    raw: j,
  };
}

/** A ride's real times: boarding, getting off, and its departure at each stop. */
interface RideClock {
  dep: number;
  arr: number;
  at: number[];
}

/**
 * Rides the journey from `start` on its own timetable, each vehicle the first to leave
 * after the walk to it. The times come back real (the reversed timetable's negated, its
 * stops turned round), per leg in the journey's order; all null if a vehicle is missing.
 */
function rideClocks(
  tt: PreparedTimetable,
  j: Journey,
  start: number,
  reversed: boolean,
): (RideClock | null)[] {
  let t = start;
  const out: (RideClock | null)[] = [];
  for (const l of j.legs) {
    if (l.type === 'walk') {
      t += l.seconds;
      out.push(null);
      continue;
    }
    const n = tt.routeStopOffset[l.route + 1]! - tt.routeStopOffset[l.route]!;
    const base = tt.routeTimeOffset[l.route]!;
    let best = -1;
    for (let trip = 0; trip < tt.routeTripCount[l.route]!; trip++) {
      const d = tt.times[base + trip * n + l.fromPos]!;
      if (d >= t && (best < 0 || d < tt.times[base + best * n + l.fromPos]!)) best = trip;
    }
    if (best < 0) return j.legs.map(() => null);
    const o = base + best * n + l.fromPos;
    const k = l.stops.length;
    const dep = (i: number) => tt.times[o + i]!;
    const arr = (i: number) => tt.arrivals[o + i]!;
    t = arr(k - 1);
    // Reversed, a stop's departure is its real arrival negated and the other way round.
    out.push(
      reversed
        ? { dep: -arr(k - 1), arr: -dep(0), at: l.stops.map((_, i) => -arr(i)).reverse() }
        : { dep: dep(0), arr: arr(k - 1), at: l.stops.map((_, i) => dep(i)) },
    );
  }
  return out;
}

/** How many more connections the drawer lists. */
const MORE_TRIPS = 3;

/** The last single connection put on a card, for the drawer's more connections. */
let lastFound: NonNullable<ReturnType<typeof trip>> | null = null;

/**
 * The next departures of the shown connection (arriving: the ones arriving before it):
 * the same rides, each on the first vehicle a minute after the last one left. No new
 * search, so it costs next to nothing and never holds up a tap.
 */
export function moreTrips(
  msg: Extract<ToWorker, { type: 'moreTrips' }>,
): Omit<Extract<FromWorker, { type: 'trip' }>, 'type' | 'id'>[] {
  const last = lastTrip;
  const f0 = lastFound;
  if (!last || !f0 || f0.leave !== msg.leave || f0.arrive !== msg.arrive) return [];
  const legs = f0.journey.legs;
  const first = legs.findIndex((l) => l.type === 'ride');
  if (first < 0) return [];
  const lastRide = legs.length - 1 - [...legs].reverse().findIndex((l) => l.type === 'ride');
  const walk = (ls: typeof legs) => ls.reduce((a, l) => a + (l.type === 'walk' ? l.seconds : 0), 0);
  const before = walk(legs.slice(0, first));
  const after = walk(legs.slice(lastRide + 1));
  // On the timetable's own clock: departing it is real time, arriving it runs backwards.
  const reversed = last.direction === 'arrive';
  let from = (reversed ? -msg.arrive : msg.leave) + 60;
  const out: Omit<Extract<FromWorker, { type: 'trip' }>, 'type' | 'id'>[] = [];
  for (let k = 0; k < MORE_TRIPS; k++) {
    const own = rideClocks(last.tt, f0.raw, from, reversed);
    const clocks = reversed ? own.reverse() : own;
    const a = clocks[first];
    const b = clocks[lastRide];
    if (!a || !b) break;
    const leave = a.dep - before;
    const arrive = b.arr + after;
    out.push(
      tripMessage([{ ...f0, clocks, leave, arrive, seconds: arrive - leave, board: undefined }]),
    );
    from = (reversed ? -arrive : leave) + 60;
  }
  return out;
}

/** Places further than this from any stop go unnamed. */
const NAME_REACH_M = 800;
/** The nearest stop's name, as the card shows it ("S Südkreuz"), or null. */
export function nearestStopName(tt: PreparedTimetable, lat: number, lon: number): string | null {
  let best = -1;
  let bestM = NAME_REACH_M;
  for (let s = 0; s < tt.stopCount; s++) {
    // A cheap box first: about 800 m each way.
    if (Math.abs(tt.stopLat[s]! - lat) > 0.0075 || Math.abs(tt.stopLon[s]! - lon) > 0.012) continue;
    const m = distanceM(lat, lon, tt.stopLat[s]!, tt.stopLon[s]!);
    if (m < bestM) {
      bestM = m;
      best = s;
    }
  }
  return best < 0 ? null : stopName(tt.stops[best]!.name);
}

export function tripMessage(
  found: ReturnType<typeof trip>[],
): Omit<Extract<FromWorker, { type: 'trip' }>, 'type' | 'id'> {
  const tt = lastTrip?.tt;
  const features: Extract<FromWorker, { type: 'trip' }>['lines']['features'] = [];
  const line = (coordinates: [number, number][], mode: string, walk: boolean) => {
    if (coordinates.length >= 2)
      features.push({
        type: 'Feature',
        properties: { mode, walk },
        geometry: { type: 'LineString', coordinates },
      });
  };
  // Walks follow the footpaths their minutes were measured on, once walk.bin is in;
  // until then (or off the network) they stay straight.
  // Cycled legs (to the first and from the last stop) are drawn solid and thin.
  const walkLine = (a: [number, number], b: [number, number], bike = false) => {
    if (a[0] === b[0] && a[1] === b[1]) return;
    const path = walk && walkPath(walk, { lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] });
    line(path ?? [a, b], bike ? 'bike' : 'walk', true);
  };
  const cycling = lastTrip?.travel !== undefined && lastTrip.travel !== 'walk';
  const stops = new Map<
    number,
    Extract<FromWorker, { type: 'trip' }>['stops']['features'][number]
  >();
  const stopPoint = (s: number, mode: string, end: boolean) => {
    if (!tt) return;
    const have = stops.get(s);
    if (have) {
      if (end) have.properties.end = true;
      return;
    }
    stops.set(s, {
      type: 'Feature',
      properties: {
        name: stopName(tt.stops[s].name),
        mode,
        end,
      },
      geometry: { type: 'Point', coordinates: [tt.stopLon[s], tt.stopLat[s]] },
    });
  };
  const journeys = found.map((f) => {
    if (!f || !tt) return null;
    const pos = (s: number): [number, number] => [tt.stopLon[s], tt.stopLat[s]];
    let at = f.start;
    const legs: TripLeg[] = [];
    const all = f.journey.legs;
    const firstRide = all.findIndex((l) => l.type === 'ride');
    const lastRide = all.length - 1 - [...all].reverse().findIndex((l) => l.type === 'ride');
    // With a bike, the ways to the first stop and from the last one are cycled.
    const cycled = (i: number) => cycling && (firstRide < 0 || i < firstRide || i > lastRide);
    for (const [i, l] of all.entries()) {
      if (l.type === 'walk') {
        const minutes = Math.max(1, Math.round(l.seconds / 60));
        legs.push(cycled(i) ? { type: 'walk', minutes, bike: true } : { type: 'walk', minutes });
        continue;
      }
      walkLine(at, pos(l.from), i === firstRide && cycling);
      line(course(tt, l.stops), l.mode, false);
      stopPoint(l.from, l.mode, i === firstRide);
      stopPoint(l.to, l.mode, i === lastRide);
      at = pos(l.to);
      const clock = f.clocks[i];
      legs.push({
        type: 'ride',
        name: l.name,
        mode: l.mode,
        from: tt.stops[l.from].name,
        to: tt.stops[l.to].name,
        stops: l.stops.length - 1,
        ...(clock
          ? {
              dep: clock.dep,
              arr: clock.arr,
              passed: l.stops
                .slice(1, -1)
                .map((s, k) => ({ name: tt.stops[s].name, at: clock.at[k + 1]! })),
            }
          : {}),
      });
    }
    walkLine(at, f.end, cycling);
    return {
      legs,
      transfers: f.journey.transfers,
      ...(f.seconds !== undefined ? { minutes: Math.round(f.seconds / 60) } : {}),
      ...(f.leave !== undefined ? { leave: f.leave, arrive: f.arrive } : {}),
      ...(f.board ? { board: f.board } : {}),
      ends: [
        nearestStopName(tt, f.start[1], f.start[0]),
        nearestStopName(tt, f.end[1], f.end[0]),
      ] as [string | null, string | null],
    };
  });
  return {
    journeys,
    lines: { type: 'FeatureCollection', features },
    stops: { type: 'FeatureCollection', features: [...stops.values()] },
  };
}

/** The trip to a tapped place from each start (one start: kept for the drawer's more). */
export function tapTrip(msg: Extract<ToWorker, { type: 'trip' }>) {
  const last = lastTrip;
  // A later moment (the shown connection was missed): a pass of its own from then.
  const later =
    last && msg.leaveAt !== undefined && last.direction === 'depart' && last.travel !== 'bikeonly'
      ? { ...last, leaveAt: msg.leaveAt, from: msg.leaveAt }
      : null;
  const journeys = (last?.runs ?? []).map((r) =>
    later ? trip(later, laterRun(later, r, msg), msg) : trip(last!, nowRun(last!, r, msg), msg),
  );
  lastFound = journeys.length === 1 ? journeys[0]! : null;
  return tripMessage(journeys);
}
