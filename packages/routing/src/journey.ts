import { cellAt } from './grid';
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
      /**
       * A line that changes trips on the way (the Ring at Beusselstr.) is one ride over two or
       * more routes: each part's route, its first position and its number of stops (the stop
       * where one part ends starts the next). `route`/`fromPos` are the first part's. Absent
       * for a ride on one route.
       */
      parts?: RidePart[];
    };

/** One route of a ride that changes trips on the way (see `parts`). */
export interface RidePart {
  route: number;
  fromPos: number;
  count: number;
}

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
  const k = cellAt(grid, lat, lon);
  if (k < 0) return null;
  const total = grid.seconds[k];
  if (!(total < Infinity)) return null;
  return journeyVia(tt, result, grid.stop[k], total);
}

/**
 * The journey `total` seconds long whose last stop is `last` (-1: walking all the way),
 * rebuilt from the leg tree; the walk from that stop takes the rest of the time.
 */
export function journeyVia(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  last: number,
  total: number,
): Journey | null {
  const legs = result.legs;
  if (!legs) throw new Error('journeyVia needs a trackLegs result');
  if (last < 0) return { legs: [{ type: 'walk', seconds: Math.round(total) }], transfers: 0 };

  const out: JourneyLeg[] = [
    { type: 'walk', seconds: Math.round(total - result.stopSeconds[last]) },
  ];
  if (legs.rounds) {
    if (!followRounds(tt, legs.rounds, last, out)) return null;
  } else if (!followBest(tt, result, last, out)) return null;
  out.reverse();
  // Merge back-to-back walks and drop empty ones. A line going on from the stop where its
  // previous trip ends (the Ring changes trips at Beusselstr.) is one ride, with its parts
  // kept for its times. Where the first trip goes on elsewhere, it is a change of vehicles
  // of the same line and stays two rides.
  const merged: JourneyLeg[] = [];
  for (const leg of out) {
    const prev = merged[merged.length - 1];
    if (leg.type === 'walk' && prev?.type === 'walk') prev.seconds += leg.seconds;
    else if (
      leg.type === 'ride' &&
      prev?.type === 'ride' &&
      prev.name === leg.name &&
      prev.to === leg.from &&
      endsThere(tt, prev)
    ) {
      prev.parts = [...rideParts(prev), ...rideParts(leg)];
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
      // In round 0 a footpath follows the walk from the origin.
      const legs =
        k === 0 ? rounds : { kind: rounds.rideKind, from: rounds.rideFrom, to: rounds.rideTo };
      kind = legs.kind[k * S + s];
      from = legs.from[k * S + s];
      to = legs.to[k * S + s];
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

type Ride = Extract<JourneyLeg, { type: 'ride' }>;

/** A ride's routes: its parts, or its one route. */
export function rideParts(l: Ride): RidePart[] {
  return l.parts ?? [{ route: l.route, fromPos: l.fromPos, count: l.stops.length }];
}

/** Whether a ride's (last) trip ends where the ride does: at the last stop of its route. */
function endsThere(tt: PreparedTimetable, l: Ride): boolean {
  const p = rideParts(l).at(-1)!;
  return p.fromPos + p.count === routeLength(tt, p.route);
}

/**
 * A ride's times at each of its stops when it is ready to board at `ready`: on each route
 * the first vehicle leaving then or later (as RAPTOR boards it), the next part on the first
 * vehicle leaving its first stop once the last one got there. `dep[i]`/`arr[i]` are the
 * departure from and the arrival at `l.stops[i]`. `twins` (a ride on one route only): other
 * routes with the same stops whose vehicles count too, as positions where the ride starts.
 * Null when a part has no vehicle.
 */
export function rideTimes(
  tt: PreparedTimetable,
  l: Ride,
  ready: number,
  twins?: readonly { route: number; pos: number }[],
): { dep: number[]; arr: number[] } | null {
  const dep: number[] = [];
  const arr: number[] = [];
  let t = ready;
  for (const [n, p] of rideParts(l).entries()) {
    const from =
      n === 0 && !l.parts && twins?.length ? twins : [{ route: p.route, pos: p.fromPos }];
    let row = -1;
    for (const c of from) {
      const len = routeLength(tt, c.route);
      const base = tt.routeTimeOffset[c.route];
      for (let trip = 0; trip < tt.routeTripCount[c.route]; trip++) {
        const at = base + trip * len + c.pos;
        if (tt.times[at] >= t && (row < 0 || tt.times[at] < tt.times[row])) row = at;
      }
    }
    if (row < 0) return null;
    // The stop where this part starts is where the last one ended: its arrival stays.
    for (let i = 0; i < p.count; i++) {
      if (n > 0 && i === 0) {
        dep[dep.length - 1] = tt.times[row];
        continue;
      }
      dep.push(tt.times[row + i]);
      arr.push(tt.arrivals[row + i]);
    }
    t = arr[arr.length - 1];
  }
  return { dep, arr };
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

/**
 * The journey with a first ride that leaves the origin later or walks less, when one gets
 * to the next leg just as well: RAPTOR keeps the earliest arrival at every stop, so with
 * two ways to the same onward connection it shows the earlier one, such as an earlier
 * tram from a farther stop. Only an option that leaves no earlier and walks no more is
 * taken (the latest leaving, then the least walking); the rest of the journey stays as
 * it is. Needs `leaveAt` and the origin's walk to each stop (RoundLegs `access`).
 */
export function laterStart(
  tt: PreparedTimetable,
  j: Journey,
  access: Float32Array,
  leaveAt: number,
): Journey {
  const first = j.legs.findIndex((l) => l.type === 'ride');
  const ride = j.legs[first];
  // (A first ride that changes trips on the way is kept as it is.)
  if (ride?.type !== 'ride' || ride.parts) return j;
  let walk = 0;
  for (let i = 0; i < first; i++) {
    const l = j.legs[i];
    if (l.type === 'walk') walk += l.seconds;
  }
  const end = ride.fromPos + ride.stops.length - 1;
  const trip = boardedTrip(tt, ride.route, ride.fromPos, leaveAt + walk);
  if (trip < 0) return j;
  const at = (route: number, t: number, pos: number, times: Int32Array) =>
    times[tt.routeTimeOffset[route] + t * routeLength(tt, route) + pos];
  const leave = at(ride.route, trip, ride.fromPos, tt.times) - walk;
  const arrive = at(ride.route, trip, end, tt.arrivals);
  // Getting to the end stop by when the next ride leaves (less the walks to it) keeps it;
  // with no ride after this one, by when this one arrives.
  let deadline = arrive;
  let after = 0;
  for (let i = first + 1; i < j.legs.length; i++) {
    const l = j.legs[i];
    if (l.type === 'walk') {
      after += l.seconds;
      continue;
    }
    const next = boardedTrip(tt, l.route, l.fromPos, arrive + after);
    if (next >= 0) deadline = at(l.route, next, l.fromPos, tt.times) - after;
    break;
  }

  const target = ride.to;
  let best: { route: number; from: number; to: number; walk: number; leave: number } | null = null;
  for (let e = tt.stopRouteOffset[target]; e < tt.stopRouteOffset[target + 1]; e++) {
    const route = tt.stopRouteRoute[e];
    const to = tt.stopRouteIndex[e];
    const so = tt.routeStopOffset[route];
    for (let from = 0; from < to; from++) {
      const w = access[tt.routeStops[so + from]];
      if (!(w <= walk)) continue;
      for (let t = 0; t < tt.routeTripCount[route]; t++) {
        const dep = at(route, t, from, tt.times);
        if (dep < leaveAt + w || at(route, t, to, tt.arrivals) > deadline) continue;
        const l = dep - w;
        const better = best
          ? l > best.leave || (l === best.leave && w < best.walk)
          : l > leave || (l === leave && w < walk);
        if (better) best = { route, from, to, walk: w, leave: l };
      }
    }
  }
  if (!best) return j;
  const legs: JourneyLeg[] = [
    ...(best.walk > 0
      ? [
          {
            type: 'walk' as const,
            seconds: Math.round(best.walk),
            to: tt.routeStops[tt.routeStopOffset[best.route] + best.from],
          },
        ]
      : []),
    rideLeg(tt, best.route, best.from, best.to),
    ...j.legs.slice(first + 1),
  ];
  const rides = legs.filter((l) => l.type === 'ride').length;
  return { legs, transfers: Math.max(0, rides - 1) };
}

/**
 * The journey with each change made where it walks least (Hendrik, 2026-11-05: "getting off
 * one stop before the ideal one and suggesting a foot path instead"). RAPTOR boards a route
 * at the first stop where its trip can be caught; reaching that stop on foot ties with
 * staying on the vehicle before, and the tie goes to the walk. For two rides in a row this
 * looks along the first vehicle's later stops for one the next vehicle also passes (the same
 * stop, or one footpath of the timetable away) early enough to change there, and takes the
 * one with the shortest walk if it saves at least `minSaving` seconds. The same vehicles are
 * ridden, so the journey arrives as before. Times the rides from `leaveAt` as rideTimes does;
 * rides over several trips (`parts`) are left as they are.
 */
export function laterChange(
  tt: PreparedTimetable,
  j: Journey,
  leaveAt: number,
  minSaving = 60,
): Journey {
  const legs = [...j.legs];
  let t = leaveAt;
  let changed = false;
  for (let i = 0; i < legs.length; i++) {
    const a = legs[i];
    if (a.type === 'walk') {
      t += a.seconds;
      continue;
    }
    const ta = rideTimes(tt, a, t);
    if (!ta) return j;
    t = ta.arr[ta.arr.length - 1];
    // The walks up to the next ride.
    let k = i + 1;
    let walk = 0;
    for (let l = legs[k]; l?.type === 'walk'; l = legs[++k]) walk += l.seconds;
    const b = legs[k];
    if (b?.type !== 'ride' || a.parts || b.parts || walk < minSaving) continue;
    const tb = rideTimes(tt, b, t + walk);
    if (!tb) return j;
    const rowA = vehicleRow(tt, a.route, a.fromPos, ta.dep[0]);
    const rowB = vehicleRow(tt, b.route, b.fromPos, tb.dep[0]);
    if (rowA < 0 || rowB < 0) continue;
    const offA = tt.routeStopOffset[a.route];
    const offB = tt.routeStopOffset[b.route];
    const outA = a.fromPos + a.stops.length - 1;
    const endB = b.fromPos + b.stops.length - 1;
    let best: { p: number; q: number; w: number; to: number } | null = null;
    for (let p = outA + 1; p < routeLength(tt, a.route); p++) {
      const sA = tt.routeStops[offA + p];
      for (let q = b.fromPos; q < endB; q++) {
        const sB = tt.routeStops[offB + q];
        const w = sA === sB ? 0 : footpath(tt, sA, sB);
        if (w === null || w > walk - minSaving || (best && w >= best.w)) continue;
        if (tt.arrivals[rowA + p] + w > tt.times[rowB + q]) continue;
        best = { p, q, w, to: sB };
      }
    }
    if (!best) continue;
    const change: JourneyLeg[] = [
      rideLeg(tt, a.route, a.fromPos, best.p),
      ...(best.w > 0 ? [{ type: 'walk' as const, seconds: best.w, to: best.to }] : []),
      rideLeg(tt, b.route, best.q, endB),
    ];
    legs.splice(i, k - i + 1, ...change);
    changed = true;
    // Times go on from the new end of the first ride (the new walk, if any, comes next).
    t = tt.arrivals[rowA + best.p];
  }
  return changed ? { legs, transfers: j.transfers } : j;
}

/** A walk at either end over this many seconds makes a feeder ride worth looking for (S045). */
export const ALT_WALK_CAP_S = 600;
/** A feeder ride is offered when it walks at least this many seconds less at the ends. */
export const ALT_MIN_SAVING_S = 180;

/**
 * The walks at the two ends of a journey in seconds: before its first ride and after its
 * last one. A journey without a ride has none (it is one walk, not an end).
 */
export function endWalks(j: Journey): [number, number] {
  const first = j.legs.findIndex((l) => l.type === 'ride');
  if (first < 0) return [0, 0];
  const last = j.legs.length - 1 - [...j.legs].reverse().findIndex((l) => l.type === 'ride');
  const sum = (ls: JourneyLeg[]) => ls.reduce((a, l) => a + (l.type === 'walk' ? l.seconds : 0), 0);
  return [sum(j.legs.slice(0, first)), sum(j.legs.slice(last + 1))];
}

/**
 * Whether a trip walks long enough at an end for a feeder ride to be looked for: the same
 * trip with every walk capped at `ALT_WALK_CAP_S` (decision 0012).
 */
export function wantsFeeder(j: Journey): boolean {
  const [a, z] = endWalks(j);
  return Math.max(a, z) > ALT_WALK_CAP_S;
}

/**
 * Whether `alt` is the feeder ride for `shown`: it rides, arrives no later than `shown` (both
 * arrival times on one clock) and walks `ALT_MIN_SAVING_S` or more less at the ends. Says at
 * which end the walk shrank most and by how many seconds in all.
 */
export function feederSaving(
  shown: Journey,
  shownArrive: number,
  alt: Journey,
  altArrive: number,
): { where: 'start' | 'end'; saved: number } | null {
  if (!alt.legs.some((l) => l.type === 'ride') || altArrive > shownArrive) return null;
  const [a0, z0] = endWalks(shown);
  const [a1, z1] = endWalks(alt);
  const saved = a0 + z0 - (a1 + z1);
  if (saved < ALT_MIN_SAVING_S) return null;
  return { where: a0 - a1 >= z0 - z1 ? 'start' : 'end', saved };
}

/** The row (index of its first stop's time) of the vehicle on `route` leaving `pos` at `dep`. */
function vehicleRow(tt: PreparedTimetable, route: number, pos: number, dep: number): number {
  const n = routeLength(tt, route);
  const base = tt.routeTimeOffset[route];
  for (let trip = 0; trip < tt.routeTripCount[route]; trip++)
    if (tt.times[base + trip * n + pos] === dep) return base + trip * n;
  return -1;
}

/** The timetable's footpath from one stop to another in seconds, or null if there is none. */
function footpath(tt: PreparedTimetable, from: number, to: number): number | null {
  for (let e = tt.transferOffset[from]; e < tt.transferOffset[from + 1]; e++)
    if (tt.transferTo[e] === to) return tt.transferSeconds[e];
  return null;
}

const routeLength = (tt: PreparedTimetable, route: number) =>
  tt.routeStopOffset[route + 1] - tt.routeStopOffset[route];

/** The trip RAPTOR boards at `pos` when ready at `ready`: the first to leave then or later. */
function boardedTrip(tt: PreparedTimetable, route: number, pos: number, ready: number): number {
  const n = routeLength(tt, route);
  const base = tt.routeTimeOffset[route];
  let best = -1;
  for (let t = 0; t < tt.routeTripCount[route]; t++) {
    const d = tt.times[base + t * n + pos];
    if (d >= ready && (best < 0 || d < tt.times[base + best * n + pos])) best = t;
  }
  return best;
}
