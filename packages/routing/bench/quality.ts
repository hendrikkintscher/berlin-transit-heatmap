// Route quality check (S036): the pieces of bench/providers.ts that are worth a test. A trip
// from the app or from another journey planner is read into one shape (seconds of the service
// day, its rides and walks), compared, and the app's own trip is checked for a ride left too
// early: would staying on the last vehicle to a later stop arrive as early with less walking?
import { distanceM, type Journey, type PreparedTimetable } from '../src';

/** One trip, from any planner: times in seconds of the service day (local midnight). */
export interface TripSummary {
  depart: number;
  arrive: number;
  rides: { line: string; from: string; to: string; dep: number; arr: number }[];
  /** Walking before the first ride, between rides, after the last ride (seconds). */
  walkStart: number;
  walkMid: number;
  walkEnd: number;
}

export const walkTotal = (t: TripSummary) => t.walkStart + t.walkMid + t.walkEnd;

/** Seconds of the service day for an ISO time, the day starting at `dayStartMs`. */
const daySeconds = (iso: string, dayStartMs: number) =>
  Math.round((Date.parse(iso) - dayStartMs) / 1000);

/** Of several trips the one arriving first; on a tie, fewer rides, then less walking. */
export function bestOf(trips: TripSummary[]): TripSummary | null {
  let best: TripSummary | null = null;
  for (const t of trips) {
    if (
      !best ||
      t.arrive < best.arrive ||
      (t.arrive === best.arrive &&
        (t.rides.length < best.rides.length ||
          (t.rides.length === best.rides.length && walkTotal(t) < walkTotal(best))))
    )
      best = t;
  }
  return best;
}

/** Walk seconds before, between and after the rides of a leg list. */
function walks(legs: { ride: boolean; seconds: number }[]) {
  const first = legs.findIndex((l) => l.ride);
  const last = legs.length - 1 - [...legs].reverse().findIndex((l) => l.ride);
  let walkStart = 0;
  let walkMid = 0;
  let walkEnd = 0;
  legs.forEach((l, i) => {
    if (l.ride) return;
    if (first < 0 || i < first) walkStart += l.seconds;
    else if (i > last) walkEnd += l.seconds;
    else walkMid += l.seconds;
  });
  return { walkStart, walkMid, walkEnd };
}

interface VbbLeg {
  walking?: boolean;
  line?: { name?: string };
  origin?: { name?: string };
  destination?: { name?: string };
  plannedDeparture?: string;
  plannedArrival?: string;
}

/**
 * VBB's journey planner (HAFAS, as v6.vbb.transport.rest gives it): the trips it suggests,
 * on planned times (no delays). Waiting at a stop between legs counts as neither walk nor ride.
 */
export function vbbTrips(json: { journeys?: { legs: VbbLeg[] }[] }, dayStartMs: number) {
  const out: TripSummary[] = [];
  for (const j of json.journeys ?? []) {
    const legs = j.legs.filter((l) => l.plannedDeparture && l.plannedArrival);
    if (!legs.length) continue;
    const s = (l: VbbLeg) =>
      daySeconds(l.plannedArrival!, dayStartMs) - daySeconds(l.plannedDeparture!, dayStartMs);
    out.push({
      depart: daySeconds(legs[0].plannedDeparture!, dayStartMs),
      arrive: daySeconds(legs[legs.length - 1].plannedArrival!, dayStartMs),
      rides: legs
        .filter((l) => !l.walking)
        .map((l) => ({
          line: l.line?.name ?? '?',
          from: l.origin?.name ?? '?',
          to: l.destination?.name ?? '?',
          dep: daySeconds(l.plannedDeparture!, dayStartMs),
          arr: daySeconds(l.plannedArrival!, dayStartMs),
        })),
      ...walks(legs.map((l) => ({ ride: !l.walking, seconds: s(l) }))),
    });
  }
  return out;
}

interface MotisLeg {
  mode: string;
  routeShortName?: string;
  from: { name?: string };
  to: { name?: string };
  startTime: string;
  endTime: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
}

/** Transitous (MOTIS 2, /api/v4/plan): its itineraries on scheduled times. */
export function motisTrips(json: { itineraries?: { legs: MotisLeg[] }[] }, dayStartMs: number) {
  const out: TripSummary[] = [];
  const start = (l: MotisLeg) => daySeconds(l.scheduledStartTime ?? l.startTime, dayStartMs);
  const end = (l: MotisLeg) => daySeconds(l.scheduledEndTime ?? l.endTime, dayStartMs);
  for (const it of json.itineraries ?? []) {
    const legs = it.legs;
    if (!legs.length) continue;
    const ride = (l: MotisLeg) => l.mode !== 'WALK';
    out.push({
      depart: start(legs[0]),
      arrive: end(legs[legs.length - 1]),
      rides: legs.filter(ride).map((l) => ({
        line: l.routeShortName ?? l.mode,
        from: l.from.name ?? '?',
        to: l.to.name ?? '?',
        dep: start(l),
        arr: end(l),
      })),
      ...walks(legs.map((l) => ({ ride: ride(l), seconds: end(l) - start(l) }))),
    });
  }
  return out;
}

/** The vehicle a ride leg takes: the first one on its route leaving its first stop at `t` or later. */
export function vehicleAt(tt: PreparedTimetable, route: number, pos: number, t: number) {
  const n = tt.routeStopOffset[route + 1] - tt.routeStopOffset[route];
  const base = tt.routeTimeOffset[route];
  let best = -1;
  for (let trip = 0; trip < tt.routeTripCount[route]; trip++) {
    const at = base + trip * n + pos;
    if (tt.times[at] >= t && (best < 0 || tt.times[at] < tt.times[best])) best = at;
  }
  // The vehicle's row: its time at the route's first stop is times[row + 0].
  return best < 0 ? -1 : best - pos;
}

/**
 * The times of a ride leg: the first vehicle on its route leaving its first stop at `t` or
 * later, and where the leg runs past the end of that route (a line that changes trips on the
 * way, as the Ring does at Beusselstr.: journeyVia makes that one leg), the same line's trip
 * going on from that stop. `dep` at the first stop, `arr` at the last; `merged` when it had to
 * go on. Null when no vehicle is found.
 */
export function rideTimes(
  tt: PreparedTimetable,
  l: Extract<Journey['legs'][number], { type: 'ride' }>,
  t: number,
): { dep: number; arr: number; merged: boolean } | null {
  let route = l.route;
  let pos = l.fromPos;
  let v = vehicleAt(tt, route, pos, t);
  if (v < 0) return null;
  const dep = tt.times[v + pos];
  let i = 0;
  let merged = false;
  for (;;) {
    const n = tt.routeStopOffset[route + 1] - tt.routeStopOffset[route];
    const m = Math.min(n - 1 - pos, l.stops.length - 1 - i);
    i += m;
    const arr = tt.arrivals[v + pos + m];
    if (i === l.stops.length - 1) return { dep, arr, merged };
    // Goes on from l.stops[i] to l.stops[i + 1] on another route of the same line.
    merged = true;
    const next = nextRoute(tt, l.name, l.stops[i], l.stops[i + 1]);
    if (!next) return null;
    [route, pos] = next;
    v = vehicleAt(tt, route, pos, arr);
    if (v < 0) return null;
  }
}

/** A route of line `name` with stop `a` right before `b`: [route, position of a]. */
function nextRoute(tt: PreparedTimetable, name: string, a: number, b: number) {
  for (let r = 0; r < tt.routeTripCount.length; r++) {
    if (tt.routeNames[r] !== name) continue;
    const o = tt.routeStopOffset[r];
    const n = tt.routeStopOffset[r + 1] - o;
    for (let q = 0; q < n - 1; q++)
      if (tt.routeStops[o + q] === a && tt.routeStops[o + q + 1] === b) return [r, q] as const;
  }
  return null;
}

/**
 * The app's journey as a TripSummary, its rides timed from `leave` (as the trip card does).
 * `merged` counts rides that change trips on the way (see rideTimes).
 */
export function appTrip(
  tt: PreparedTimetable,
  j: Journey,
  leave: number,
): (TripSummary & { merged: number }) | null {
  let t = leave;
  let merged = 0;
  const legs: { ride: boolean; seconds: number }[] = [];
  const rides: TripSummary['rides'] = [];
  for (const l of j.legs) {
    if (l.type === 'walk') {
      legs.push({ ride: false, seconds: l.seconds });
      t += l.seconds;
      continue;
    }
    const r = rideTimes(tt, l, t);
    if (!r) return null;
    if (r.merged) merged++;
    rides.push({
      line: l.name,
      from: tt.stops[l.from].name,
      to: tt.stops[l.to].name,
      dep: r.dep,
      arr: r.arr,
    });
    legs.push({ ride: true, seconds: r.arr - t });
    t = r.arr;
  }
  const w = walks(legs);
  const firstRide = rides[0];
  return {
    depart: firstRide ? firstRide.dep - w.walkStart : leave,
    arrive: t,
    rides,
    ...w,
    merged,
  };
}

/** A later stop of the last vehicle that gets there as early (within `slack`) with less walking. */
export interface StayOn {
  stop: string;
  /** How many stops further than where the app gets off. */
  further: number;
  arrive: number;
  walkEnd: number;
}

/**
 * Staying on the app's last vehicle: for each later stop of that vehicle, the arrival there
 * plus the walk to the destination (`egress[stop]`, seconds; Infinity beyond reach). Returns
 * the stop with the least walking among those arriving at most `slack` seconds after the app's
 * trip, if it walks at least `minLessWalk` seconds less than the app; else null.
 */
export function stayOn(
  tt: PreparedTimetable,
  j: Journey,
  leave: number,
  egress: Float32Array,
  slack = 60,
  minLessWalk = 120,
): StayOn | null {
  const trip = appTrip(tt, j, leave);
  const lastIdx = j.legs.map((l) => l.type).lastIndexOf('ride');
  const last = j.legs[lastIdx];
  if (!trip || last?.type !== 'ride') return null;
  // Its vehicle: the one the trip card shows (timed as appTrip does).
  let t = leave;
  for (let i = 0; i < lastIdx; i++) {
    const l = j.legs[i];
    if (l.type === 'walk') t += l.seconds;
    else t = rideTimes(tt, l, t)!.arr;
  }
  const off = tt.routeStopOffset[last.route];
  const n = tt.routeStopOffset[last.route + 1] - off;
  const getOff = last.fromPos + last.stops.length - 1;
  // (A last ride that changes trips on the way is left as it is.)
  if (getOff >= n) return null;
  const v = vehicleAt(tt, last.route, last.fromPos, t);
  if (v < 0) return null;
  let found: StayOn | null = null;
  for (let p = getOff + 1; p < n; p++) {
    const s = tt.routeStops[off + p];
    const walk = egress[s];
    if (!(walk < Infinity)) continue;
    const arrive = tt.arrivals[v + p] + walk;
    if (arrive > trip.arrive + slack) continue;
    if (walk <= trip.walkEnd - minLessWalk && (!found || walk < found.walkEnd))
      found = { stop: tt.stops[s].name, further: p - getOff, arrive, walkEnd: walk };
  }
  return found;
}

/** A transfer made later: staying on one vehicle to a later stop and catching the same next one there. */
export interface StayOnTransfer {
  /** Index of the ride (0-based) the trip gets off too early. */
  ride: number;
  line: string;
  next: string;
  /** Where the app changes, and where staying on changes instead. */
  getOff: string;
  stop: string;
  further: number;
  /** The app's walk between the two vehicles and the one when staying on (seconds). */
  walk: number;
  walkThere: number;
}

/**
 * Staying on at a transfer: for two rides in a row, a later stop of the first vehicle that is
 * next to (within `nearM` of) a stop of the second vehicle (where the app boards it, or
 * later), reached early enough to change there (a walk at `walkMps` over 1.3× the straight
 * line, plus `changeS`). The same
 * second vehicle is taken, so the trip arrives as before; returns the first such change that
 * walks at least `minLessWalk` seconds less than the app's, else null.
 */
export function stayOnTransfer(
  tt: PreparedTimetable,
  j: Journey,
  leave: number,
  walkMps = 5 / 3.6,
  nearM = 250,
  changeS = 60,
  minLessWalk = 120,
): StayOnTransfer | null {
  let t = leave;
  const at: { v: number; arr: number }[] = [];
  for (const l of j.legs) {
    if (l.type === 'walk') {
      t += l.seconds;
      at.push({ v: -1, arr: t });
      continue;
    }
    const r = rideTimes(tt, l, t);
    if (!r) return null;
    t = r.arr;
    at.push({ v: r.merged ? -1 : vehicleAt(tt, l.route, l.fromPos, r.dep), arr: t });
  }
  const dist = (a: number, b: number) =>
    distanceM(tt.stops[a].lat, tt.stops[a].lon, tt.stops[b].lat, tt.stops[b].lon);
  for (let i = 0; i < j.legs.length; i++) {
    const a = j.legs[i];
    if (a.type !== 'ride') continue;
    let k = i + 1;
    let walk = 0;
    for (let l = j.legs[k]; l?.type === 'walk'; l = j.legs[++k]) walk += l.seconds;
    const b = j.legs[k];
    if (b?.type !== 'ride') continue;
    const offA = tt.routeStopOffset[a.route];
    const nA = tt.routeStopOffset[a.route + 1] - offA;
    const offB = tt.routeStopOffset[b.route];
    const outA = a.fromPos + a.stops.length - 1;
    const vA = at[i].v;
    const vB = at[k].v;
    // (Rides that change trips on the way are left out.)
    if (vA < 0 || vB < 0) continue;
    for (let p = outA + 1; p < nA; p++) {
      const sA = tt.routeStops[offA + p];
      for (let q = b.fromPos; q < b.fromPos + b.stops.length - 1; q++) {
        const sB = tt.routeStops[offB + q];
        const d = dist(sA, sB);
        if (d > nearM) continue;
        const walkThere = sA === sB ? 0 : (1.3 * d) / walkMps;
        if (tt.arrivals[vA + p] + walkThere + changeS > tt.times[vB + q]) continue;
        if (walkThere <= walk - minLessWalk)
          return {
            ride: j.legs.slice(0, i + 1).filter((l) => l.type === 'ride').length - 1,
            line: a.name,
            next: b.name,
            getOff: tt.stops[a.to].name,
            stop: tt.stops[sA].name,
            further: p - outA,
            walk,
            walkThere: Math.round(walkThere),
          };
      }
    }
  }
  return null;
}

/** Why the app's trip arrives later than another planner's (a rough class, for the report). */
export type Why = 'stay-on' | 'longer-walk' | 'other-lines' | 'fewer-rides' | 'same-lines';

export function why(app: TripSummary, ref: TripSummary, staysOn: boolean): Why {
  if (staysOn) return 'stay-on';
  const lines = (t: TripSummary) => t.rides.map((r) => r.line).join(' ');
  if (lines(app) === lines(ref))
    return walkTotal(app) > walkTotal(ref) + 120 ? 'longer-walk' : 'same-lines';
  if (ref.rides.length < app.rides.length) return 'fewer-rides';
  return 'other-lines';
}
