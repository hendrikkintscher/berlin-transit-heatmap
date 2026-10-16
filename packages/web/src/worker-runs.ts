// One start's map: the routing pass from it and its grid, and what is read off grids.
import {
  BIKE_ONLY_MAX_SECONDS,
  BIKE_SPEED_MPS,
  BIKE_STATION_SECONDS,
  cellAt,
  cellColRow,
  goalCells,
  goalWindow,
  gridLayout,
  heatGrid,
  NETWORK_WALK_SPEED_MPS,
  routeUsage,
  travelTimes,
  type HeatGrid,
  type Origin,
  type PreparedTimetable,
  type TravelTimeResult,
  type UsedSegment,
} from '@berlin-transit-heatmap/routing';
import { departuresPerHour, stations } from './layers';
import { type MeetCandidate } from './meet';
import type { Travel } from './protocol';
import { walk, walkSpeedMps } from './worker-paths';

/** Raster cell size. 50 m keeps walking detail around stops; ~60 ms per origin in Node. */
export const CELL_M = 50;
/** Hops carrying less than this share of the reachable map are left off the route overlay. */
const MIN_ROUTE_SHARE = 0.01;

/** Stations with at least this many departures an hour can be suggested as meeting points. */
const MEET_MIN_PER_HOUR = 6;
const meetCache = new WeakMap<PreparedTimetable, MeetCandidate[]>();
/** Meeting-point candidates: the stations of this timetable, worked out once per file. */
export function meetCandidates(tt: PreparedTimetable): MeetCandidate[] {
  let c = meetCache.get(tt);
  if (!c) {
    c = stations(tt, departuresPerHour(tt))
      .features.filter((f) => f.properties.perHour >= MEET_MIN_PER_HOUR)
      .map((f) => ({
        name: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }));
    meetCache.set(tt, c);
  }
  return c;
}

/** The smallest finite value (0 when there is none). */
export function minFinite(values: Float32Array): number {
  let m = Infinity;
  for (const v of values) if (v < m) m = v;
  return m < Infinity ? m : 0;
}

/** The grid cell at a point; -1 outside the grid. */
export function cellIndex(g: HeatGrid, p: { lat: number; lon: number }): number {
  return cellAt(g, p.lat, p.lon);
}

/** A grid's time at a point; Infinity outside it. */
export function cellSeconds(g: HeatGrid, p: { lat: number; lon: number }): number {
  const i = cellIndex(g, p);
  return i < 0 ? Infinity : g.seconds[i];
}

export interface Run {
  result: TravelTimeResult;
  /** The pass from now that trips on tap follow (see nowRun), made on the first tap. */
  now?: TravelTimeResult;
  /**
   * Grid with the stop each cell is reached from (lines and trips follow it): the shown
   * one (under Typisch the typical grid; trips on tap then follow their own pass).
   */
  best: HeatGrid;
  /** The grid the map shows: best case, or typical with waiting included. */
  shown: HeatGrid;
  used: UsedSegment[];
}

export function run(
  tt: PreparedTimetable,
  origin: Origin,
  typical: boolean,
  travel: Travel,
  usage = true,
  leaveAt?: number,
): Run {
  if (travel === 'bikeonly') {
    // Cycling all the way: no stops, just the street network out to an hour.
    const w = { walk, walkSpeedMps: BIKE_SPEED_MPS };
    const reach = {
      maxFinalWalkSeconds: BIKE_ONLY_MAX_SECONDS,
      maxFallbackWalkSeconds: BIKE_ONLY_MAX_SECONDS,
    };
    const access = travelTimes(tt, origin, { trackLegs: usage, maxRounds: 0, ...w });
    const result = { ...access, stopSeconds: new Float32Array(tt.stopCount).fill(Infinity) };
    const best = heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: usage, ...w, ...reach });
    return { result, best, shown: best, used: [] };
  }
  const w = travelOptions(travel);
  const result = travelTimes(tt, origin, { trackLegs: usage, typical, leaveAt, ...w });
  // Typisch: one grid only, the typical one the map shows. Its cells' stops are good
  // enough for the lines (trips on tap make their own pass from now, see nowRun), so no
  // best-case grid is built next to it.
  const grid = heatGrid(
    tt,
    typical && result.typicalSeconds ? { ...result, stopSeconds: result.typicalSeconds } : result,
    { cellSizeM: CELL_M, trackStops: usage, ...w },
  );
  const used = usage ? routeUsage(tt, result, grid, { minShare: MIN_ROUTE_SHARE }) : [];
  return { result, best: grid, shown: grid, used };
}

/** Routing and grid options for walking, or cycling to and from the stations. */
export function travelOptions(travel: Travel) {
  return travel === 'bike'
    ? {
        walk,
        walkSpeedMps: BIKE_SPEED_MPS,
        accessPenaltySeconds: BIKE_STATION_SECONDS,
        egressPenaltySeconds: BIKE_STATION_SECONDS,
        // Cycling all the way stays an option where it beats the trains.
        maxOriginSeconds: BIKE_ONLY_MAX_SECONDS,
        // Until the street network is in, straight-line rides spread over ten
        // minutes only, so the first map is as quick as on foot.
        ...(walk ? {} : { maxFinalWalkSeconds: 600, maxFallbackWalkSeconds: 600 }),
      }
    : { walk, walkSpeedMps, ...FASTEST_WALK };
}

/**
 * On foot, every walk up to 30 minutes counts at both ends, and the fastest way wins even
 * with a longer walk (roadmap 0.13.9): before, a walk over 15 minutes counted only where no
 * stop was nearer, so the map and the trip on tap could each pick another walk (3+ minutes
 * apart in 16 % of places, now 7 %; bench/walkrule.ts).
 */
const FASTEST_WALK = {
  maxInitialWalkSeconds: 1800,
  maxFallbackWalkSeconds: 1800,
  maxFinalWalkSeconds: 1800,
} as const;

/** Meeting point: each cell gets the slowest trip ("where can we all be in N min?"). */
export function slowestOf(grids: HeatGrid[]): HeatGrid {
  if (grids.length === 1) return grids[0];
  const seconds = Float32Array.from(grids[0].seconds);
  for (const g of grids.slice(1))
    for (let i = 0; i < seconds.length; i++)
      if (g.seconds[i] > seconds[i]) seconds[i] = g.seconds[i];
  return { ...grids[0], seconds, stop: undefined };
}

/** How far past the moment the trips are asked for the profile search looks for arrivals. */
const GOAL_SPAN_S = 4200;
/**
 * Leaving at a set time, how long after it a stop may be reached on foot and still count when
 * guessing a cell's best stop (goalWindow); the cell then takes the vehicle caught after its
 * own walk. Ten minutes picked the right stop in the most cases in the real-data check
 * (bench/goal.ts).
 */
const GOAL_WAIT_S = 600;
/** Cells each way around the Ziel where walking all the way is looked at (15 minutes' walk). */
const GOAL_WALK_CELLS_MAX = 100;
/** Beyond the hour, how far Typisch and Bestfall look for arrivals (as forward Typisch). */
const GOAL_HORIZON_S = 2700;
/** The pass whose lines are drawn for a map to the Ziel: arriving this long after leaving. */
const GOAL_LINES_S = 2400;

/** The start of the hour of a reversed timetable's file (real seconds of the service day). */
export const fileHourStart = (back: PreparedTimetable) => -back.windowEnd - 3600;

/**
 * The map to a Ziel with a time to leave: how long from every place, leaving then. `back` is
 * the hour's timetable reversed (prepared(..., 'arrive')), `leave` the moment to leave on
 * Nächste (real seconds of the service day); Typisch and Bestfall take leaving at any
 * moment of the hour. A profile search from the Ziel gives each stop's arrivals for every
 * moment of leaving, the grid is made from a good guess of each cell's best stop and the
 * cells corrected to the vehicle they catch after their walk (goal.ts in the routing package).
 * The lines drawn follow a pass arriving a while later, as the trips of that map do.
 */
export function goalRun(
  back: PreparedTimetable,
  origin: Origin,
  measure: 'next' | 'typical' | 'best',
  leave: number,
  travel: Travel,
  usage = true,
): Run {
  // Cycling all the way has no timetable: the same as a map to the Ziel arriving.
  if (travel === 'bikeonly') return run(back, origin, false, travel, usage, -leave);
  const w = travelOptions(travel);
  const next = measure === 'next';
  const from = next ? leave : fileHourStart(back);
  const to = next ? from + GOAL_WAIT_S : from + 3600;
  const span = next ? GOAL_SPAN_S : 3600 + GOAL_HORIZON_S;
  const found = travelTimes(back, origin, {
    profile: { from: -(from + span), to: -from },
    arriveBy: -from,
    ...w,
  });
  const profile = found.profile!;
  const stopSeconds = goalWindow(profile, from, to, measure === 'typical');
  const grid = heatGrid(
    back,
    { ...found, stopSeconds },
    { cellSizeM: CELL_M, trackStops: true, ...w },
  );
  if (next) {
    // Walking all the way: only around the Ziel, where it can beat the stop-based minutes.
    const [col, row] = cellColRow(gridLayout({ cellSizeM: CELL_M }), origin.lat, origin.lon);
    const reach = Math.min(
      GOAL_WALK_CELLS_MAX,
      Math.ceil((900 * (w.walkSpeedMps ?? NETWORK_WALK_SPEED_MPS)) / CELL_M) + 2,
    );
    const near = { c0: col - reach, r0: row - reach, cols: 2 * reach + 1, rows: 2 * reach + 1 };
    const walkOnly = heatGrid(
      back,
      { ...found, stopSeconds: new Float32Array(stopSeconds.length).fill(Infinity) },
      { cellSizeM: CELL_M, window: near, ...w },
    );
    goalCells(grid, stopSeconds, profile, leave, {
      grid: walkOnly,
      c0: Math.max(0, near.c0),
      r0: Math.max(0, near.r0),
    });
  }
  // The lines: the quickest ways arriving a while later than leaving.
  const result = usage
    ? travelTimes(back, origin, { trackLegs: true, leaveAt: -(from + GOAL_LINES_S), ...w })
    : found;
  const used = usage ? routeUsage(back, result, grid, { minShare: MIN_ROUTE_SHARE }) : [];
  return { result, best: grid, shown: grid, used };
}
