// One start's map: the routing pass from it and its grid, and what is read off grids.
import {
  BIKE_ONLY_MAX_SECONDS,
  BIKE_SPEED_MPS,
  BIKE_STATION_SECONDS,
  cellAt,
  heatGrid,
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
    : { walk, walkSpeedMps };
}

/** Meeting point: each cell gets the slowest trip ("where can we all be in N min?"). */
export function slowestOf(grids: HeatGrid[]): HeatGrid {
  if (grids.length === 1) return grids[0];
  const seconds = Float32Array.from(grids[0].seconds);
  for (const g of grids.slice(1))
    for (let i = 0; i < seconds.length; i++)
      if (g.seconds[i] > seconds[i]) seconds[i] = g.seconds[i];
  return { ...grids[0], seconds, stop: undefined };
}
