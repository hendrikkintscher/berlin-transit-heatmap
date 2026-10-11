import { distanceM, WALK_SPEED_MPS } from './geo';
import type { PreparedTimetable } from './prepare';
import { LEG_ORIGIN, LEG_WALK } from './raptor';
import type { HeatGrid, RouteMode, TravelTimeResult } from './types';

/** One leg of a journey, in travel order. */
export type JourneyLeg =
  | { type: 'walk'; seconds: number; to?: number }
  | {
      type: 'ride';
      name: string;
      mode: RouteMode;
      /** Stop indices where the ride starts and ends. */
      from: number;
      to: number;
      /** Stop indices passed, from `from` to `to` inclusive. */
      stops: number[];
    };

export interface Journey {
  legs: JourneyLeg[];
  /** Number of vehicles boarded minus one (0 if none). */
  transfers: number;
}

const MAX_LEGS = 40;

/**
 * The fastest journey to the grid cell at (lat, lon), rebuilt from the leg tree:
 * walk from the origin, rides and transfer walks, and the final walk to the cell.
 * Needs `travelTimes(..., { trackLegs: true })` and `heatGrid(..., { trackStops: true })`.
 * Returns null when the cell is outside the grid or unreachable.
 */
export function journeyTo(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  grid: HeatGrid,
  lat: number,
  lon: number,
): Journey | null {
  const legs = result.legs;
  if (!legs || !grid.stop) throw new Error('journeyTo needs trackLegs and trackStops results');
  const [minLon, minLat, maxLon, maxLat] = grid.bbox;
  const c = Math.floor(((lon - minLon) / (maxLon - minLon)) * grid.cols);
  const r = Math.floor(((maxLat - lat) / (maxLat - minLat)) * grid.rows);
  if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) return null;
  const k = r * grid.cols + c;
  const total = grid.seconds[k];
  if (!(total < Infinity)) return null;
  const last = grid.stop[k];
  if (last < 0) return { legs: [{ type: 'walk', seconds: Math.round(total) }], transfers: 0 };

  const out: JourneyLeg[] = [
    { type: 'walk', seconds: Math.round(total - result.stopSeconds[last]) },
  ];
  let s = last;
  for (let n = 0; n < MAX_LEGS; n++) {
    const kind = legs.kind[s];
    if (kind >= 0) {
      const so = tt.routeStopOffset[kind];
      const stops = Array.from(tt.routeStops.subarray(so + legs.from[s], so + legs.to[s] + 1));
      out.push({
        type: 'ride',
        name: tt.routeNames[kind],
        mode: tt.routeModes[kind],
        from: stops[0],
        to: stops[stops.length - 1],
        stops,
      });
      s = stops[0];
    } else if (kind === LEG_WALK) {
      const from = legs.from[s];
      out.push({ type: 'walk', seconds: transferSeconds(tt, from, s), to: s });
      s = from;
    } else if (kind === LEG_ORIGIN) {
      const o = result.origin;
      const d = o ? distanceM(o.lat, o.lon, tt.stopLat[s], tt.stopLon[s]) : 0;
      out.push({ type: 'walk', seconds: Math.round(d / WALK_SPEED_MPS), to: s });
      break;
    } else return null;
  }
  out.reverse();
  // Merge back-to-back walks and drop empty ones.
  const merged: JourneyLeg[] = [];
  for (const leg of out) {
    const prev = merged[merged.length - 1];
    if (leg.type === 'walk' && prev?.type === 'walk') prev.seconds += leg.seconds;
    else if (!(leg.type === 'walk' && leg.seconds === 0)) merged.push(leg);
  }
  const rides = merged.filter((l) => l.type === 'ride').length;
  return { legs: merged, transfers: Math.max(0, rides - 1) };
}

function transferSeconds(tt: PreparedTimetable, from: number, to: number): number {
  for (let e = tt.transferOffset[from]; e < tt.transferOffset[from + 1]; e++) {
    if (tt.transferTo[e] === to) return tt.transferSeconds[e];
  }
  return 0;
}
