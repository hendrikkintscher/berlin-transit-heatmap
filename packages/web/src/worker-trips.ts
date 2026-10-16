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
  tripBetween,
  walkPath,
  type Journey,
  type PreparedTimetable,
  type TravelTimeResult,
  type TripTime,
  type WalkNetwork,
  walksToStops,
} from '@berlin-transit-heatmap/routing';
import type { Direction, FromWorker, ToWorker, Travel, TripLeg } from './protocol';
import { bestRows } from './more-rows';
import { stopName } from './stop-name';
import { course, walk } from './worker-paths';
import { CELL_M, cellSeconds, travelOptions, type Run } from './worker-runs';
import { prepared, type Variant } from './worker-timetables';

/** The last computed map, as trips on tap need it. */
export interface LastTrip {
  tt: PreparedTimetable;
  runs: Run[];
  /** 'depart': the map runs from its place; 'arrive': to it, on the reversed timetable. */
  direction: Direction;
  /**
   * Leaving to the map's place: the moment the places leave (seconds of the service day). The
   * map runs to its place ('arrive'), but its trips leave at this time (tripBetween).
   */
  leaving?: number;
  travel: Travel;
  /** When trips on tap leave, if not with the map's own pass. */
  leaveAt: number | null;
  /** The moment trips on tap leave from (seconds of the service day), departing. */
  from: number;
  /**
   * The map's timetable the other way round (reversed, or arriving the forward one), so a
   * trip on tap comes out the same whichever end the map is made from; made on demand.
   */
  other?: () => Promise<PreparedTimetable | null>;
  /** `other` once it is in (null: not to be had). */
  otherTt?: PreparedTimetable | null;
  /** The map's timetable variant, for the next hour's file (see tapTrip). */
  variant?: Variant;
}
/** The last computed map, kept for trip lookups on tap. */
let lastTrip: LastTrip | null = null;
export function setLastTrip(last: LastTrip) {
  lastTrip = last;
}

/** Makes ready what trips on tap of the last map need (the timetable the other way round). */
export async function tripsReady(): Promise<void> {
  const last = lastTrip;
  if (!last?.other || last.otherTt !== undefined) return;
  const tt = await last.other();
  last.otherTt ??= tt;
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
  return nearRun(last.tt, nowPass(last, last.leaveAt, r), at, travelOptions(last.travel));
}

/** The pass from now for one start of the last map (made once, on tap or ahead of it). */
function nowPass(last: LastTrip, leaveAt: number, r: Run): TravelTimeResult {
  const w = travelOptions(last.travel);
  return (r.now ??= travelTimes(last.tt, r.result.origin!, { trackLegs: true, leaveAt, ...w }));
}

/**
 * Makes the next start's pass from now ahead of a tap, so the first tap's trip is as quick
 * as the ones after it. Returns false once every start has its pass (or none needs one).
 */
export function warmNextTrip(): boolean {
  const last = lastTrip;
  if (!last || last.leaveAt === null || last.travel === 'bikeonly') return false;
  const r = last.runs.find((x) => !x.now);
  if (!r) return false;
  nowPass(last, last.leaveAt, r);
  return true;
}

/**
 * The start's pass at the moment trips on tap leave (arriving: arrive): the map's own for
 * "Nächste", else the one from now (kept), or for a later moment one of its own.
 */
function passAt(last: LastTrip, r: Run, later: boolean): TravelTimeResult {
  if (last.leaveAt === null) return r.result;
  if (!later) return nowPass(last, last.leaveAt, r);
  const w = travelOptions(last.travel);
  return travelTimes(last.tt, r.result.origin!, { trackLegs: true, leaveAt: last.leaveAt, ...w });
}

/** As nowRun, leaving at `last.leaveAt` instead of the map's moment; not kept. */
function laterRun(
  last: LastTrip & { leaveAt: number },
  r: Run,
  at: { lat: number; lon: number },
  maxRounds?: number,
): TripRun {
  const w = travelOptions(last.travel);
  const result = travelTimes(last.tt, r.result.origin!, {
    trackLegs: true,
    leaveAt: last.leaveAt,
    maxRounds,
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
  // (Cycling all the way to the Ziel leaving: the trip takes as long whenever it leaves.)
  const leaves = last.leaving ?? -(last.from + total);
  return {
    journey: { ...j, legs },
    start: here,
    end: point,
    seconds,
    leave: leaves,
    arrive: last.leaving !== undefined ? leaves + total : -leave,
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
  twins?: Twin[][],
): (RideClock | null)[] {
  let t = start;
  const out: (RideClock | null)[] = [];
  for (const [li, l] of j.legs.entries()) {
    if (l.type === 'walk') {
      t += l.seconds;
      out.push(null);
      continue;
    }
    // The first vehicle after `t` on the ride's route (or any of its twins).
    let o = -1;
    for (const { route, pos } of twins?.[li] ?? [{ route: l.route, pos: l.fromPos }]) {
      const n = tt.routeStopOffset[route + 1]! - tt.routeStopOffset[route]!;
      const base = tt.routeTimeOffset[route]!;
      for (let trip = 0; trip < tt.routeTripCount[route]!; trip++) {
        const at = base + trip * n + pos;
        const d = tt.times[at]!;
        if (d >= t && (o < 0 || d < tt.times[o]!)) o = at;
      }
    }
    if (o < 0) return j.legs.map(() => null);
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

/** At most this many more connections in the drawer, */
const MORE_TRIPS = 10;
/**
 * leaving within an hour after the shown one (arriving: arriving within the hour before
 * it). The hour's timetable file also holds the trips of the next two hours, so the list
 * runs on past the full hour without loading anything.
 */
const MORE_SPAN_S = 3600;
/** A bound on the vehicles tried, as rows that arrive no earlier are skipped. */
const MORE_TRIES = 40;

/**
 * How much later than the map's minutes a trip to the Ziel leaving may arrive and still be
 * found by the first, bounded search (tripBetween's arriveByHint); it searches again if not.
 */
const HINT_ROOM_S = 900;

/** The walks from the last map's place to the stops (see originWalks). */
let walksKept: {
  tt: PreparedTimetable;
  lat: number;
  lon: number;
  travel: Travel;
  walk: WalkNetwork | undefined;
  speed: number | undefined;
  walks: Float32Array;
} | null = null;

/**
 * The walks from a map's place to the stops, as tripBetween needs them at that end: kept
 * for the next tap on the same map, so a tap walks the footpaths from the tapped place only
 * (roadmap 0.13.12a). New with another place, timetable, way of travel or footpath network.
 */
function originWalks(
  tt: PreparedTimetable,
  o: { lat: number; lon: number },
  travel: Travel,
  w: ReturnType<typeof travelOptions>,
): Float32Array {
  const k = walksKept;
  const same =
    k?.tt === tt &&
    k.lat === o.lat &&
    k.lon === o.lon &&
    k.travel === travel &&
    k.walk === w.walk &&
    k.speed === w.walkSpeedMps;
  if (same) return k.walks;
  const walks = walksToStops(tt, o, w);
  walksKept = { tt, lat: o.lat, lon: o.lon, travel, walk: w.walk, speed: w.walkSpeedMps, walks };
  return walks;
}

/**
 * The trip to (arriving: from) the tapped place as both ends see it (tripBetween): the
 * same journey whether the map is made from this end or the other, so moving the map to
 * the other end of a trip keeps it. `pass` is the start's pass at the trip's moment, `time`
 * the trip's span or moment if not the map's own. Null without the timetable the other way
 * round, by bike all the way, or out of reach (the map's own grid then finds it, as before).
 * To the Ziel leaving, the map's place is the trip's end and the trip leaves at `leaving`;
 * `mapSeconds`, the map's minutes at the tapped place, then bound its first search.
 */
function bothWays(
  last: LastTrip,
  origin: { lat: number; lon: number } | undefined,
  pass: TravelTimeResult | undefined,
  at: { lat: number; lon: number },
  time?: TripTime,
  mapSeconds?: number,
) {
  const other = last.otherTt;
  if (!other || last.travel === 'bikeonly' || !origin) return null;
  const w = travelOptions(last.travel);
  // The map runs from its place on the forward timetable, or to it on the reversed one.
  const mapFwd = last.direction === 'depart';
  // The card tells a trip that leaves at a time: from a start, or to the Ziel leaving.
  const depart = mapFwd || last.leaving !== undefined;
  const o = origin;
  const place = { lat: at.lat, lon: at.lon };
  const [fwd, back] = mapFwd ? [last.tt, other] : [other, last.tt];
  const [from, to] = mapFwd ? [o, place] : [place, o];
  const own: TripTime =
    last.leaving !== undefined
      ? { leave: last.leaving }
      : depart
        ? { leave: last.from }
        : { arrive: -last.from };
  // The map's own place is the same on every tap: its walks to the stops are found once.
  const ends = originWalks(fwd, o, last.travel, w);
  const f = tripBetween(
    fwd,
    back,
    from,
    to,
    time ?? own,
    {
      ...w,
      ...('maxOriginSeconds' in w ? { directMaxSeconds: w.maxOriginSeconds } : {}),
      ...(mapFwd ? { fromWalks: ends } : { toWalks: ends }),
      // To the Ziel leaving at the map's time: the trip arrives about when the map says.
      ...(!time && last.leaving !== undefined && mapSeconds !== undefined && mapSeconds < Infinity
        ? { arriveByHint: last.leaving + mapSeconds + HINT_ROOM_S }
        : {}),
    },
    time ? undefined : pass,
  );
  if (!f) return null;
  const j = f.journey;
  let board: { stop: number; line: string; at: number } | undefined;
  const first = j.legs.findIndex((l) => l.type === 'ride');
  const ride = j.legs[first];
  if (depart && ride?.type === 'ride') {
    const walkTo = j.legs
      .slice(0, first)
      .reduce((a, l) => a + (l.type === 'walk' ? l.seconds : 0), 0);
    const dep = departureAt(fwd, ride.route, ride.fromPos, f.leave + walkTo);
    if (dep !== null) board = { stop: ride.from, line: ride.name, at: dep };
  }
  // On the map's own timetable for the drawer's next connections: arriving, the reversed
  // one, the journey turned round onto its routes. (To the Ziel leaving, the drawer runs on
  // the forward timetable, as for any trip that leaves at a time.)
  const raw: Journey = depart
    ? j
    : {
        ...j,
        legs: [...j.legs].reverse().map((l) => {
          if (l.type !== 'ride') return l;
          const turned = { ...l, from: l.to, to: l.from, stops: [...l.stops].reverse() };
          const [twin] = twinRoutes(back, turned);
          return { ...turned, route: twin!.route, fromPos: twin!.pos };
        }),
      };
  return {
    journey: j,
    start: [from.lon, from.lat] as [number, number],
    end: [to.lon, to.lat] as [number, number],
    // As the map counts: leaving, from the map's moment (waiting included); arriving, to it.
    seconds: depart ? f.arrive - (last.leaving ?? last.from) : -last.from - f.leave,
    leave: f.leave,
    arrive: f.arrive,
    board,
    clocks: rideClocks(fwd, j, f.leave, false),
    raw,
  };
}

/** A route and the position on it where a ride starts. */
interface Twin {
  route: number;
  pos: number;
}

/**
 * The routes a ride could also be taken on: the same line over the same stops. One line's
 * trips are split over several routes where they overtake, so the next vehicle may be on
 * another one than the shown ride's.
 */
function twinRoutes(
  tt: PreparedTimetable,
  l: Extract<Journey['legs'][number], { type: 'ride' }>,
): Twin[] {
  const out: Twin[] = [];
  const k = l.stops.length;
  for (let e = tt.stopRouteOffset[l.from]!; e < tt.stopRouteOffset[l.from + 1]!; e++) {
    const route = tt.stopRouteRoute[e]!;
    const pos = tt.stopRouteIndex[e]!;
    const so = tt.routeStopOffset[route]! + pos;
    if (tt.routeNames[route] !== l.name || so + k > tt.routeStopOffset[route + 1]!) continue;
    let i = 0;
    while (i < k && tt.routeStops[so + i] === l.stops[i]) i++;
    if (i === k) out.push({ route, pos });
  }
  return out.length ? out : [{ route: l.route, pos: l.fromPos }];
}

/** The last single connection put on a card, for the drawer's more connections. */
let lastFound: NonNullable<ReturnType<typeof trip>> | null = null;
/** The map (or the next hour's file) that connection was found on. */
let lastFoundOn: LastTrip | null = null;

/** A drawer row on the timetable's own clock: the start moves on, the end must improve. */
interface MoreRow {
  start: number;
  end: number;
  found: NonNullable<ReturnType<typeof trip>>;
}

/** What the drawer's list is built from: the shown connection, on the timetable's clock. */
interface MoreBase {
  msg: Extract<ToWorker, { type: 'moreTrips' }>;
  last: LastTrip;
  /** The timetable the connections run on (to the Ziel leaving: the forward one). */
  tt: PreparedTimetable;
  f0: NonNullable<ReturnType<typeof trip>>;
  reversed: boolean;
  own: readonly [number, number];
}

function moreBase(msg: Extract<ToWorker, { type: 'moreTrips' }>): MoreBase | null {
  const last = lastFoundOn;
  const f0 = lastFound;
  if (!last || !f0 || f0.leave !== msg.leave || f0.arrive !== msg.arrive) return null;
  if (!f0.journey.legs.some((l) => l.type === 'ride')) return null;
  // On the timetable's own clock: departing it is real time, arriving it runs backwards.
  const reversed = last.direction === 'arrive' && last.leaving === undefined;
  const tt = last.leaving === undefined ? last.tt : last.otherTt;
  if (!tt) return null;
  const own = reversed ? ([-msg.arrive, -msg.leave] as const) : ([msg.leave, msg.arrive] as const);
  return { msg, last, tt, f0, reversed, own };
}

/**
 * The next departures of the shown connection (arriving: the ones arriving before it):
 * the same rides, each on the first vehicle a minute after the last one left, for the
 * hour after the shown one. A row that arrives no earlier than the one before it (a
 * later first ride waiting for the same onward vehicle) stands in for it: same arrival,
 * less waiting. No new search, so it costs next to nothing and never holds up a tap.
 */
function sameRides(b: MoreBase): MoreRow[] {
  const { tt, f0, reversed, own } = b;
  const legs = f0.journey.legs;
  const first = legs.findIndex((l) => l.type === 'ride');
  const lastRide = legs.length - 1 - [...legs].reverse().findIndex((l) => l.type === 'ride');
  const walk = (ls: typeof legs) => ls.reduce((a, l) => a + (l.type === 'walk' ? l.seconds : 0), 0);
  const before = walk(legs.slice(0, first));
  const after = walk(legs.slice(lastRide + 1));
  const twins = f0.raw.legs.map((l) => (l.type === 'ride' ? twinRoutes(tt, l) : []));
  const rows: MoreRow[] = [];
  let from = own[0] + 60;
  for (let k = 0; k < MORE_TRIES; k++) {
    const clocks = rideClocks(tt, f0.raw, from, reversed, twins);
    if (reversed) clocks.reverse();
    const a = clocks[first];
    const z = clocks[lastRide];
    if (!a || !z) break;
    const leave = a.dep - before;
    const arrive = z.arr + after;
    const [start, end] = reversed ? [-arrive, -leave] : [leave, arrive];
    if (start - own[0] > MORE_SPAN_S) break;
    from = start + 60;
    const found = { ...f0, clocks, leave, arrive, seconds: arrive - leave, board: undefined };
    const prev = rows.at(-1);
    if (end <= (prev?.end ?? own[1])) {
      if (prev) Object.assign(prev, { start, end, found });
      continue;
    }
    if (rows.length === MORE_TRIPS) break;
    rows.push({ start, end, found });
  }
  return rows;
}

/** At most this many searches for connections on other lines, one per row they find. */
const OTHER_PASSES = 12;

/**
 * The connections on any line, the drawer's second step: a search leaving a minute after
 * the last row found (arriving: arriving a minute before it) gives the next connection
 * that arrives earliest, which may be on another line than the shown one (a faster
 * S-Bahn). One search per step, so the caller can let a tap or a new map go first.
 */
function* otherLines(b: MoreBase): Generator<MoreRow | null, void, void> {
  const { last, reversed, own, msg } = b;
  if (last.travel === 'bikeonly') return;
  const r = last.runs[0];
  if (!r || last.runs.length !== 1) return;
  // A change more than the shown connection at most: fewer rounds, a quicker search.
  const rounds = b.f0.journey.legs.filter((l) => l.type === 'ride').length + 1;
  let from = own[0] + 60;
  for (let k = 0; k < OTHER_PASSES; k++) {
    const at = { ...last, leaveAt: from, from };
    // To the Ziel leaving: the connection from the place to it that arrives earliest.
    const f =
      last.leaving !== undefined
        ? bothWays({ ...at, leaving: from }, r.result.origin, undefined, msg, { leave: from })
        : trip(at, laterRun(at, r, msg, rounds), msg);
    if (!f || f.leave === undefined || f.arrive === undefined) return;
    if (!f.journey.legs.some((l) => l.type === 'ride')) return;
    const [start, end] = reversed ? [-f.arrive, -f.leave] : [f.leave, f.arrive];
    if (start - own[0] > MORE_SPAN_S || start < from) return;
    from = start + 60;
    yield end > own[1] ? { start, end, found: { ...f, board: undefined } } : null;
  }
}

const lines = (r: MoreRow) =>
  r.found.journey.legs.map((l) => (l.type === 'ride' ? l.name : '')).join();
const sameLines = (a: MoreRow, b: MoreRow) => lines(a) === lines(b);

const rowMessages = (b: MoreBase, rows: MoreRow[]) =>
  bestRows(rows, MORE_TRIPS).map(({ start, end, found }) => {
    const [leave, arrive] = b.reversed ? [-end, -start] : [start, end];
    return tripMessage([{ ...found, leave, arrive, seconds: arrive - leave }]);
  });

/**
 * The drawer's connections after the shown one (arriving: before it), in steps: first
 * the shown connection's own rides later on, at once; then, one search at a time, the
 * ones on other lines that arrive earlier. Each list that changed goes out whole, and
 * once the searches are through, `done` says so (a list cut short stays not done);
 * `fresh` (awaited before each search) says whether it is still wanted. Quiet, only the
 * finished list goes out (the drawer shows the old one meanwhile).
 */
export async function moreTrips(
  msg: Extract<ToWorker, { type: 'moreTrips' }>,
  send: (
    trips: Omit<Extract<FromWorker, { type: 'trip' }>, 'type' | 'id'>[],
    done: boolean,
  ) => void,
  fresh: () => Promise<boolean>,
): Promise<void> {
  const b = moreBase(msg);
  if (!b) return msg.quiet ? undefined : send([], true);
  const rows = sameRides(b);
  if (!msg.quiet) send(rowMessages(b, rows), false);
  const others = otherLines(b);
  let seen = bestRows(rows, MORE_TRIPS);
  while ((await fresh()) && lastFound === b.f0) {
    const step = others.next();
    if (step.done) return send(rowMessages(b, rows), true);
    const row = step.value;
    // The shown connection's own rides found again (the walks a few seconds apart).
    const near = (r: MoreRow) =>
      Math.abs(r.start - row!.start) < 120 && Math.abs(r.end - row!.end) < 120;
    if (!row || rows.some((r) => near(r) && sameLines(r, row))) continue;
    rows.push(row);
    const best = bestRows(rows, MORE_TRIPS);
    if (best.length === seen.length && best.every((r, i) => r === seen[i])) continue;
    seen = best;
    if (!msg.quiet) send(rowMessages(b, rows), false);
  }
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
export function tapTrip(msg: Extract<ToWorker, { type: 'trip' }>, nextHour?: NextHour | null) {
  const last = lastTrip;
  // To the Ziel leaving, a trip leaves the tapped place at the map's time (or, the shown
  // connection missed, at a later one); each is its own search (tripBetween).
  const toGoal = last?.leaving !== undefined && last.travel !== 'bikeonly';
  // A later moment (the shown connection was missed): a pass of its own from then.
  const later =
    last &&
    msg.leaveAt !== undefined &&
    (last.direction === 'depart' || toGoal) &&
    last.travel !== 'bikeonly'
      ? {
          ...last,
          // Past the map's hour, on the next hour's file when it is in.
          ...(nextHour ? { tt: nextHour.tt, otherTt: nextHour.other } : {}),
          leaveAt: msg.leaveAt,
          from: msg.leaveAt,
          ...(toGoal ? { leaving: msg.leaveAt } : {}),
        }
      : null;
  const journeys = (last?.runs ?? []).map((r) => {
    const at = later ?? last!;
    if (toGoal) {
      if (!at.otherTt) return null;
      if (later) return bothWays(at, r.result.origin, undefined, msg, { leave: msg.leaveAt! });
      // A kept trip that no longer fits (the walks changed with the footpaths): the trip
      // leaving at the map's time, as on a map from a start (0.13.8).
      const kept = msg.span && bothWays(at, r.result.origin, undefined, msg, msg.span);
      return (
        kept || bothWays(at, r.result.origin, undefined, msg, undefined, cellSeconds(r.best, msg))
      );
    }
    const fixed =
      at.otherTt &&
      bothWays(at, r.result.origin, passAt(at, r, !!later), msg, later ? undefined : msg.span);
    if (fixed) return fixed;
    return later
      ? trip(later, laterRun(later, r, msg), msg)
      : trip(last!, nowRun(last!, r, msg), msg);
  });
  lastFound = journeys.length === 1 ? journeys[0]! : null;
  lastFoundOn = later ?? last;
  return tripMessage(journeys);
}

/** The next hour's timetable, both ways round, for a connection that rolled on past the map's hour. */
export interface NextHour {
  tt: PreparedTimetable;
  other: PreparedTimetable | null;
}

/**
 * Loads the next hour's file (`window`) the way the last map runs, and the other way round,
 * for a trip leaving after the map's hour (`shift`: see protocol.ts): the map's own file holds the trips starting up to
 * two hours after its hour, so trips over an hour, asked for late in the next hour, would
 * come out worse or not at all. The app preloads that hour after each map, so this is
 * usually there already; null when it cannot be had (the map's own file is used then).
 */
export async function nextHour(window: string, shift = 0): Promise<NextHour | null> {
  const last = lastTrip;
  if (!last || last.travel === 'bikeonly') return null;
  // After 23 Uhr the next day's file, its times read as the evening's (24:10 for 0:10).
  const variant = { ...last.variant, ...(shift ? { shift } : {}) };
  try {
    const [tt, other] = await Promise.all([
      prepared(window, last.direction, variant),
      prepared(window, last.direction === 'depart' ? 'arrive' : 'depart', variant).catch(
        () => null,
      ),
    ]);
    return { tt, other };
  } catch {
    return null;
  }
}
