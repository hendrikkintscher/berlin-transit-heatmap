import type { PreparedTimetable } from './prepare';
import { LEG_ORIGIN, LEG_WALK } from './raptor';
import type { HeatGrid, RoundLegs, RouteMode, TravelTimeResult } from './types';

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
      /** The prepared route ridden and the position on it where the ride starts. */
      route: number;
      fromPos: number;
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
  if (legs.rounds) {
    if (!followRounds(tt, legs.rounds, last, out)) return null;
  } else if (!followBest(tt, result, last, out)) return null;
  out.reverse();
  // Merge back-to-back walks and drop empty ones. A line continuing from the stop its
  // previous trip ended at (the Ring changes trips at Beusselstr.) is one ride.
  const merged: JourneyLeg[] = [];
  for (const leg of out) {
    const prev = merged[merged.length - 1];
    if (leg.type === 'walk' && prev?.type === 'walk') prev.seconds += leg.seconds;
    else if (
      leg.type === 'ride' &&
      prev?.type === 'ride' &&
      prev.name === leg.name &&
      prev.to === leg.from
    ) {
      prev.stops.push(...leg.stops.slice(1));
      prev.to = leg.to;
    } else if (!(leg.type === 'walk' && leg.seconds === 0)) merged.push(leg);
  }
  const rides = merged.filter((l) => l.type === 'ride').length;
  return { legs: merged, transfers: Math.max(0, rides - 1) };
}

/** Follows each stop's best leg back to the origin (range scans, where no rounds are kept). */
function followBest(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  last: number,
  out: JourneyLeg[],
): boolean {
  const legs = result.legs!;
  let s = last;
  for (let n = 0; n < MAX_LEGS; n++) {
    const kind = legs.kind[s];
    if (kind >= 0) {
      const ride = rideLeg(tt, kind, legs.from[s], legs.to[s]);
      out.push(ride);
      s = ride.from;
    } else if (kind === LEG_WALK) {
      const from = legs.from[s];
      out.push({ type: 'walk', seconds: transferSeconds(tt, from, s), to: s });
      s = from;
    } else if (kind === LEG_ORIGIN) {
      // A stop reached on foot from the origin has the walk as its time.
      out.push({ type: 'walk', seconds: Math.round(result.stopSeconds[s]), to: s });
      return true;
    } else return false;
  }
  return false;
}

/**
 * Follows the legs back round by round: a ride boarded in round k left from its first
 * stop's round k-1 arrival, and a footpath of round k from a vehicle arrival of round k.
 */
function followRounds(
  tt: PreparedTimetable,
  rounds: RoundLegs,
  last: number,
  out: JourneyLeg[],
): boolean {
  const S = tt.stopCount;
  let s = last;
  let k = rounds.round[s];
  let kind = rounds.kind[k * S + s];
  let from = rounds.from[k * S + s];
  let to = rounds.to[k * S + s];
  for (let n = 0; n < MAX_LEGS; n++) {
    if (kind >= 0) {
      const ride = rideLeg(tt, kind, from, to);
      out.push(ride);
      if (k === 0) return false;
      s = ride.from;
      k--;
      kind = rounds.kind[k * S + s];
      from = rounds.from[k * S + s];
      to = rounds.to[k * S + s];
    } else if (kind === LEG_WALK) {
      out.push({ type: 'walk', seconds: transferSeconds(tt, from, s), to: s });
      s = from;
      kind = rounds.rideKind[k * S + s];
      from = rounds.rideFrom[k * S + s];
      to = rounds.rideTo[k * S + s];
    } else if (kind === LEG_ORIGIN) {
      out.push({ type: 'walk', seconds: Math.round(rounds.access[s]), to: s });
      return true;
    } else return false;
  }
  return false;
}

function rideLeg(
  tt: PreparedTimetable,
  route: number,
  from: number,
  to: number,
): JourneyLeg & { type: 'ride' } {
  const so = tt.routeStopOffset[route];
  const stops = Array.from(tt.routeStops.subarray(so + from, so + to + 1));
  return {
    type: 'ride',
    name: tt.routeNames[route],
    mode: tt.routeModes[route],
    from: stops[0],
    to: stops[stops.length - 1],
    stops,
    route,
    fromPos: from,
  };
}

function transferSeconds(tt: PreparedTimetable, from: number, to: number): number {
  for (let e = tt.transferOffset[from]; e < tt.transferOffset[from + 1]; e++) {
    if (tt.transferTo[e] === to) return tt.transferSeconds[e];
  }
  return 0;
}

/**
 * When the first vehicle on `route` leaves its stop at position `pos` at or after `ready`
 * (seconds of the service day), as RAPTOR boards it; null if none does.
 */
export function departureAt(
  tt: PreparedTimetable,
  route: number,
  pos: number,
  ready: number,
): number | null {
  const n = tt.routeStopOffset[route + 1] - tt.routeStopOffset[route];
  const base = tt.routeTimeOffset[route];
  let best: number | null = null;
  for (let trip = 0; trip < tt.routeTripCount[route]; trip++) {
    const t = tt.times[base + trip * n + pos];
    if (t >= ready && (best === null || t < best)) best = t;
  }
  return best;
}
