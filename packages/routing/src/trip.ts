import { distanceM } from './geo';
import { journeyVia, laterStart, type Journey } from './journey';
import { UNREACHED, type PreparedTimetable } from './prepare';
import { travelTimes } from './raptor';
import type { Origin, TravelTimeOptions, TravelTimeResult } from './types';
import { walkPath, walkSpeeds } from './walk';

/** Walking all the way is a trip of its own up to this long (as the map's 15 minutes). */
const DIRECT_MAX_S = 900;

/**
 * The walk from one place to the other along the footpaths, in seconds (the same both
 * ways); Infinity when longer than `maxSeconds` or off the network.
 */
export function directSeconds(
  from: Origin,
  to: Origin,
  opts: TravelTimeOptions,
  maxSeconds = DIRECT_MAX_S,
): number {
  const speed = walkSpeeds(opts.walkSpeedMps).network;
  if (!opts.walk || distanceM(from.lat, from.lon, to.lat, to.lon) > maxSeconds * speed)
    return Infinity;
  const path = walkPath(opts.walk, from, to);
  if (!path) return Infinity;
  let m = 0;
  for (let i = 1; i < path.length; i++)
    m += distanceM(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
  const seconds = Math.round(m / speed);
  return seconds <= maxSeconds ? seconds : Infinity;
}

/**
 * The walk (or, with a bike, ride) from a place to each stop near it, in seconds; Infinity
 * beyond reach. The same walk serves leaving a place and arriving at it.
 */
export function walksToStops(
  tt: PreparedTimetable,
  place: Origin,
  opts: TravelTimeOptions = {},
): Float32Array {
  return travelTimes(tt, place, { ...opts, maxRounds: 0, trackLegs: false }).stopSeconds;
}

/**
 * Per number of rides k (index k, from 1): the earliest a pass gets to a place with at
 * most k rides, the walk from the last stop included, on the pass's own clock. Needs a
 * pass leaving at one moment with `trackLegs`.
 */
function byRides(r: TravelTimeResult, walks: Float32Array): Float64Array {
  const arrivals = r.legs?.rounds?.arrivals;
  const S = walks.length;
  const R = arrivals ? arrivals.length / S : 1;
  const out = new Float64Array(R).fill(Infinity);
  if (!arrivals) return out;
  for (let s = 0; s < S; s++) {
    const w = walks[s];
    if (!(w < Infinity)) continue;
    let at = UNREACHED;
    for (let k = 1; k < R; k++) {
      const a = arrivals[k * S + s];
      if (a < at) at = a;
      if (at < UNREACHED && at + w < out[k]) out[k] = at + w;
    }
  }
  return out;
}

/** The fewest rides that get there by `by` (an index into byRides), or 0 if none does. */
function fewestRides(arrive: Float64Array, by: number): number {
  for (let k = 1; k < arrive.length; k++) if (arrive[k] <= by) return k;
  return 0;
}

/** A trip between two places at a set time, as `tripBetween` finds it. */
export interface FixedTrip {
  /** On the forward timetable, in travel order. */
  journey: Journey;
  /** When it leaves the start and reaches the destination (seconds of the service day). */
  leave: number;
  arrive: number;
}

/** When a trip is to be: leaving at, arriving by, or within a span (both). */
export type TripTime = { leave: number } | { arrive: number } | { leave: number; arrive: number };

/**
 * The trip from `from` to `to`, the same whichever end a map is made from. Leaving at a
 * time it is one of the trips arriving earliest; arriving by a time, one of those leaving
 * latest; within a span, any trip leaving no earlier than its start and arriving by its
 * end. Of those it is the one with the fewest rides, of these the one leaving latest, then
 * the one arriving earliest. Asked for within its own span, a trip comes out again, so
 * moving the map to the other end of a trip keeps it. Walking all the way (up to
 * `directMaxSeconds`, default 15 minutes) counts as no rides.
 *
 * `fwd` and `back` are one timetable forward and reversed (reverseTimetable). `given` is
 * the pass already made from the set end at the set time with `trackLegs` (from `from` on
 * `fwd` leaving, from `to` on `back` arriving), if there is one. Null when out of reach.
 */
export function tripBetween(
  fwd: PreparedTimetable,
  back: PreparedTimetable,
  from: Origin,
  to: Origin,
  at: TripTime,
  opts: TravelTimeOptions & { directMaxSeconds?: number } = {},
  given?: TravelTimeResult,
): FixedTrip | null {
  const { directMaxSeconds, ...o } = opts;
  const walk = directSeconds(from, to, o, directMaxSeconds);
  const toWalks = walksToStops(fwd, to, o);
  const fromWalks = walksToStops(fwd, from, o);
  // The span: from the earliest leaving to the latest arriving that count.
  let lo: number;
  let hi: number;
  let rides: number;
  /** The latest leaving with that many rides, when already known. */
  let leave: number | null = null;
  if ('leave' in at && 'arrive' in at) {
    [lo, hi] = [at.leave, at.arrive];
    const r = travelTimes(fwd, from, { ...o, leaveAt: lo, arriveBy: hi, trackLegs: true });
    rides = fewestRides(byRides(r, toWalks), hi);
  } else if ('leave' in at) {
    lo = at.leave;
    const r = given ?? travelTimes(fwd, from, { ...o, leaveAt: lo, trackLegs: true });
    const arrive = byRides(r, toWalks);
    hi = Math.min(Math.min(...arrive), lo + walk);
    rides = fewestRides(arrive, hi);
  } else {
    hi = at.arrive;
    const r = given ?? travelTimes(back, to, { ...o, leaveAt: -hi, trackLegs: true });
    // On the reversed clock, getting to the start is leaving it.
    const leaving = byRides(r, fromWalks);
    lo = Math.max(-Math.min(...leaving), hi - walk);
    rides = fewestRides(leaving, -lo);
    leave = lo;
  }
  if (!(hi < Infinity && lo > -Infinity)) return null;
  if (walk <= hi - lo)
    return {
      journey: { legs: [{ type: 'walk', seconds: walk }], transfers: 0 },
      leave: hi - walk,
      arrive: hi,
    };
  if (rides === 0) return null;
  if (leave === null) {
    // The latest leaving with that many rides that still arrives by `hi`.
    const r = travelTimes(back, to, {
      ...o,
      leaveAt: -hi,
      arriveBy: -lo,
      maxRounds: rides,
      trackLegs: true,
    });
    const leaving = byRides(r, fromWalks)[rides]!;
    leave = leaving < Infinity ? -leaving : lo;
  }
  const r = travelTimes(fwd, from, { ...o, leaveAt: leave, maxRounds: rides, trackLegs: true });
  // The last stop: reached by a ride (not walked to from the start), quickest on.
  const rounds = r.legs!.rounds!;
  let last = -1;
  let seconds = Infinity;
  for (let s = 0; s < toWalks.length; s++) {
    if (rounds.round[s] === 0) continue;
    const t = r.stopSeconds[s] + toWalks[s];
    if (t < seconds) {
      seconds = t;
      last = s;
    }
  }
  if (last < 0) return null;
  const found = journeyVia(fwd, r, last, seconds);
  if (!found) return null;
  return {
    journey: laterStart(fwd, found, rounds.access, leave),
    leave,
    arrive: leave + seconds,
  };
}
