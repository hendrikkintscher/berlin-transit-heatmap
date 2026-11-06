// Route quality suite (S040): a reference search to check the app's trips are the fastest on
// its own data. Connection Scan (Dibbelt et al.), not RAPTOR: every timetable connection
// (one vehicle from one stop to the next) in order of departure, so it shares nothing with
// raptor.ts but the timetable, the walks and the footpaths it is given. The same model as
// the app: boarding needs the arrival at the stop by the departure (no change time), the
// timetable's footpaths are one hop after a ride (and after the walk from the origin, as
// RAPTOR's round 0), and any number of rides (the app stops at DEFAULT_MAX_ROUNDS = 6).
import type { PreparedTimetable } from '../src';

interface Connections {
  dep: Int32Array;
  arr: Int32Array;
  from: Int32Array;
  to: Int32Array;
  /** The vehicle: its row in the timetable's times. */
  trip: Int32Array;
  trips: number;
}

const cache = new WeakMap<PreparedTimetable, Connections>();

/** Every connection of the timetable, by departure. */
function connections(tt: PreparedTimetable): Connections {
  let c = cache.get(tt);
  if (c) return c;
  const list: [number, number, number, number, number][] = [];
  let trips = 0;
  for (let r = 0; r < tt.routeTripCount.length; r++) {
    const off = tt.routeStopOffset[r];
    const n = tt.routeStopOffset[r + 1] - off;
    for (let k = 0; k < tt.routeTripCount[r]; k++) {
      const row = tt.routeTimeOffset[r] + k * n;
      const id = trips++;
      for (let i = 0; i + 1 < n; i++)
        list.push([
          tt.times[row + i],
          tt.arrivals[row + i + 1],
          tt.routeStops[off + i],
          tt.routeStops[off + i + 1],
          id,
        ]);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  c = {
    dep: Int32Array.from(list, (x) => x[0]),
    arr: Int32Array.from(list, (x) => x[1]),
    from: Int32Array.from(list, (x) => x[2]),
    to: Int32Array.from(list, (x) => x[3]),
    trip: Int32Array.from(list, (x) => x[4]),
    trips,
  };
  cache.set(tt, c);
  return c;
}

/**
 * The earliest arrival at a place leaving at `leave`: `access[s]` is the walk from the start
 * to stop s, `egress[s]` from stop s to the place (seconds, Infinity beyond reach), `direct`
 * the walk all the way. Returns the arrival (seconds of the day), the rides it takes, each
 * stop's earliest arrival and the stop the place is walked to from (-1: walking all the way).
 */
export function earliestArrival(
  tt: PreparedTimetable,
  access: Float32Array,
  egress: Float32Array,
  leave: number,
  direct = Infinity,
): { arrive: number; rides: number; best: Float64Array; last: number } {
  const S = tt.stopCount;
  const c = connections(tt);
  const best = new Float64Array(S).fill(Infinity);
  const byRide = new Float64Array(S).fill(Infinity);
  const rides = new Uint8Array(S);
  const boarded = new Int16Array(c.trips).fill(-1);
  const foot = (s: number, t: number, k: number) => {
    for (let e = tt.transferOffset[s]; e < tt.transferOffset[s + 1]; e++) {
      const to = tt.transferTo[e];
      const at = t + tt.transferSeconds[e];
      if (at < best[to]) {
        best[to] = at;
        rides[to] = k;
      }
    }
  };
  for (let s = 0; s < S; s++)
    if (access[s] < Infinity && leave + access[s] < best[s]) best[s] = leave + access[s];
  for (let s = 0; s < S; s++) if (access[s] < Infinity) foot(s, leave + access[s], 0);
  // Connections from the first leaving at `leave` or later.
  let lo = 0;
  let hi = c.dep.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.dep[mid] < leave) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < c.dep.length; i++) {
    const t = c.trip[i];
    if (boarded[t] < 0 && best[c.from[i]] <= c.dep[i]) boarded[t] = rides[c.from[i]] + 1;
    if (boarded[t] < 0) continue;
    const to = c.to[i];
    if (c.arr[i] < byRide[to]) {
      byRide[to] = c.arr[i];
      if (c.arr[i] < best[to]) {
        best[to] = c.arr[i];
        rides[to] = boarded[t];
      }
      foot(to, c.arr[i], boarded[t]);
    }
  }
  let arrive = leave + direct;
  let k = 0;
  let last = -1;
  for (let s = 0; s < S; s++) {
    // The walk to the place follows a ride (walking start → stop → place is the direct walk's).
    if (rides[s] === 0) continue;
    const a = best[s] + egress[s];
    if (a < arrive) {
      arrive = a;
      k = rides[s];
      last = s;
    }
  }
  return { arrive, rides: k, best, last };
}
