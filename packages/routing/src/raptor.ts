import { forStopsWithin, UNREACHED, type PreparedTimetable } from './prepare';
import type { Origin, TravelTimeOptions, TravelTimeResult } from './types';
import {
  sameEdgeMetres,
  snapOrigin,
  snapStops,
  timeAt,
  walkFrom,
  walkSpeeds,
  WalkSources,
} from './walk';

const DEFAULT_MAX_INITIAL_WALK_S = 900;

/** TravelLegs.kind values; any value >= 0 is a (sub-)route index. */
export const LEG_NONE = -3;
export const LEG_ORIGIN = -2;
export const LEG_WALK = -1;
const DEFAULT_MAX_ROUNDS = 6;
/** With `typical`, departures this long after the window are scanned too, so leaving late in the window still finds a next trip. */
const DEFAULT_TYPICAL_HORIZON_S = 2700;

const now: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

/**
 * Range-RAPTOR (rRAPTOR) travel times from `origin` to every stop.
 *
 * Every distinct origin departure time in [windowStart, windowEnd] that lines
 * up with a trip departing an access stop is scanned, latest first. Labels are
 * kept between departures (an arrival reachable when leaving later is still
 * reachable when leaving earlier), so each scan only does work where the
 * earlier departure actually helps. A stop's travel time is the minimum over
 * departures of (arrival - departure).
 */
export function travelTimes(
  tt: PreparedTimetable,
  origin: Origin,
  opts: TravelTimeOptions = {},
): TravelTimeResult {
  const t0 = now();
  const maxWalk = opts.maxInitialWalkSeconds ?? DEFAULT_MAX_INITIAL_WALK_S;
  const maxRounds = Math.max(0, Math.floor(opts.maxRounds ?? DEFAULT_MAX_ROUNDS));
  const S = tt.stopCount;

  // Access stops: everything within walking range of the origin.
  const accessStops: number[] = [];
  const accessWalk: number[] = [];
  const ox = (origin.lon - tt.proj.lon0) * tt.proj.mPerLon;
  const oy = (origin.lat - tt.proj.lat0) * tt.proj.mPerLat;
  const net = opts.walk;
  const speeds = walkSpeeds(opts.walkSpeedMps);
  const originSnap = net ? snapOrigin(net, origin) : null;
  if (net && originSnap && originSnap.edge[0] >= 0) {
    // Walk the footpath network; stops off the network fall back to a straight line.
    const pace = 1 / speeds.network;
    const maxM = maxWalk * speeds.network;
    const sources = new WalkSources(pace);
    sources.add(net, originSnap, 0, 0, 0, -1);
    const labels = walkFrom(
      net,
      sources.nodes,
      sources.times,
      sources.walked,
      sources.tags,
      maxM,
      pace,
    );
    const snaps = snapStops(net, tt);
    forStopsWithin(tt, ox, oy, maxM, (s, d) => {
      const t =
        snaps.edge[s] >= 0
          ? Math.min(
              timeAt(net, labels, snaps, s, maxM, pace),
              sameEdgeMetres(net, originSnap, 0, snaps, s) * pace,
            )
          : d / speeds.straight;
      if (t <= maxWalk) {
        accessStops.push(s);
        accessWalk.push(Math.round(t));
      }
    });
  } else {
    forStopsWithin(tt, ox, oy, maxWalk * speeds.straight, (s, d) => {
      accessStops.push(s);
      accessWalk.push(Math.round(d / speeds.straight));
    });
  }

  const best = new Float32Array(S).fill(Infinity);
  for (let a = 0; a < accessStops.length; a++) {
    const s = accessStops[a];
    if (accessWalk[a] < best[s]) best[s] = accessWalk[a];
  }

  const typical = opts.typical === true;
  const horizon = typical ? (opts.typicalHorizonSeconds ?? DEFAULT_TYPICAL_HORIZON_S) : 0;
  const departures = departureTimes(tt, accessStops, accessWalk, horizon);
  const ws = tt.windowStart;
  const we = tt.windowEnd;

  // Typical time: the average over leaving at any moment t in [ws, we] of
  // (earliest arrival when leaving at t or later) - t, waiting at the start included.
  // Departures are scanned latest first and tauStar only improves, so after a
  // departure d tauStar[s] is the earliest arrival for anyone leaving in
  // (next earlier departure, d]. Each stop's integral is accumulated piecewise,
  // when its value changes: the old value covered (d, since[s]]. Late in the window a
  // far stop may have no journey left within the timetable's horizon; the average then
  // covers only the part of the window before that (coverEnd).
  const integral = new Float64Array(typical ? S : 0);
  const since = new Float64Array(typical ? S : 0).fill(Infinity);
  const lastValue = new Float64Array(typical ? S : 0).fill(Infinity);
  const coverEnd = new Float64Array(typical ? S : 0);
  /** Adds the old value of stop s over (lo, since[s]] clipped to the window. */
  const settle = (s: number, lo: number) => {
    const v = lastValue[s];
    if (v === Infinity) {
      coverEnd[s] = Math.max(ws, Math.min(lo, we));
      return;
    }
    const a = Math.max(lo, ws);
    const b = Math.min(since[s], we);
    if (b > a) integral[s] += v * (b - a) - (b * b - a * a) / 2;
  };
  const walkOnly = new Float64Array(typical ? S : 0).fill(Infinity);
  if (typical)
    for (let a = 0; a < accessStops.length; a++) {
      const s = accessStops[a];
      if (accessWalk[a] < walkOnly[s]) walkOnly[s] = accessWalk[a];
    }

  // Last leg of each stop's best journey (see TravelLegs). starLeg* describe how
  // tauStar was last improved within the current departure; they are copied to
  // leg* when that departure improves the stop's best travel time.
  const track = opts.trackLegs === true;
  const legKind = new Int32Array(track ? S : 0).fill(LEG_NONE);
  const legFrom = new Int32Array(track ? S : 0);
  const legTo = new Int32Array(track ? S : 0);
  const starKind = new Int32Array(track ? S : 0).fill(LEG_NONE);
  const starFrom = new Int32Array(track ? S : 0);
  const starTo = new Int32Array(track ? S : 0);
  if (track) {
    for (let a = 0; a < accessStops.length; a++) {
      const s = accessStops[a];
      if (best[s] === accessWalk[a]) legKind[s] = LEG_ORIGIN;
    }
  }

  if (departures.length > 0 && maxRounds > 0) {
    const { routeStopOffset, routeStops, routeTripCount, routeTimeOffset, times } = tt;
    const { stopRouteOffset, stopRouteRoute, stopRouteIndex } = tt;
    const { transferOffset, transferTo, transferSeconds } = tt;

    // tau[k * S + s]: earliest arrival at s using at most k trips. Kept across departures.
    const tau = new Int32Array((maxRounds + 1) * S).fill(UNREACHED);
    const tauStar = new Int32Array(S).fill(UNREACHED);
    // Earliest arrival at s on board a vehicle. Footpaths start only from
    // vehicle arrivals, so this is tracked separately: a stop first reached on
    // foot must still pass its footpaths on when a vehicle gets there later.
    const vehStar = new Int32Array(S).fill(UNREACHED);

    // Stops improved in the previous / current round.
    let marked = new Int32Array(S);
    let markedCount = 0;
    let nextMarked = new Int32Array(S);
    let nextCount = 0;
    const isNextMarked = new Uint8Array(S);
    // Stops with a better vehicle arrival this round (footpath sources), and that arrival.
    const routeMarked = new Int32Array(S);
    const routeMarkedArr = new Int32Array(S);
    const isRouteMarked = new Int32Array(S).fill(-1);
    let routeMarkedCount = 0;
    // Stops whose tauStar changed during the current departure.
    const touched = new Int32Array(S);
    let touchedCount = 0;
    const isTouched = new Uint8Array(S);
    // Routes to scan this round with the earliest marked index on them.
    const routeFrom = new Int32Array(tt.routeCount).fill(-1);
    const queue = new Int32Array(tt.routeCount);

    for (let d = 0; d < departures.length; d++) {
      const dep = departures[d];

      // Round 0: walk from the origin.
      markedCount = 0;
      for (let a = 0; a < accessStops.length; a++) {
        const s = accessStops[a];
        const arr = dep + accessWalk[a];
        if (arr < tauStar[s]) {
          tau[s] = arr;
          tauStar[s] = arr;
          if (track) starKind[s] = LEG_ORIGIN;
          marked[markedCount++] = s;
          if (!isTouched[s]) {
            isTouched[s] = 1;
            touched[touchedCount++] = s;
          }
        }
      }

      for (let k = 1; k <= maxRounds && markedCount > 0; k++) {
        const prevBase = (k - 1) * S;
        const curBase = k * S;

        // Collect routes serving marked stops.
        let queueCount = 0;
        for (let m = 0; m < markedCount; m++) {
          const s = marked[m];
          for (let e = stopRouteOffset[s]; e < stopRouteOffset[s + 1]; e++) {
            const r = stopRouteRoute[e];
            const i = stopRouteIndex[e];
            const cur = routeFrom[r];
            if (cur === -1) {
              routeFrom[r] = i;
              queue[queueCount++] = r;
            } else if (i < cur) {
              routeFrom[r] = i;
            }
          }
        }

        // Scan routes.
        nextCount = 0;
        routeMarkedCount = 0;
        for (let q = 0; q < queueCount; q++) {
          const r = queue[q];
          const from = routeFrom[r];
          routeFrom[r] = -1;
          const so = routeStopOffset[r];
          const n = routeStopOffset[r + 1] - so;
          const tripCount = routeTripCount[r];
          const base = routeTimeOffset[r];
          let trip = -1;
          let tripBase = 0;
          let boardIdx = 0;
          for (let i = from; i < n; i++) {
            const s = routeStops[so + i];
            if (trip >= 0) {
              const arr = times[tripBase + i];
              if (arr < vehStar[s]) {
                vehStar[s] = arr;
                const rm = isRouteMarked[s];
                if (rm < 0) {
                  isRouteMarked[s] = routeMarkedCount;
                  routeMarked[routeMarkedCount] = s;
                  routeMarkedArr[routeMarkedCount++] = arr;
                } else {
                  routeMarkedArr[rm] = arr;
                }
                if (arr < tauStar[s]) {
                  tau[curBase + s] = arr;
                  tauStar[s] = arr;
                  if (track) {
                    starKind[s] = r;
                    starFrom[s] = boardIdx;
                    starTo[s] = i;
                  }
                  if (!isNextMarked[s]) {
                    isNextMarked[s] = 1;
                    nextMarked[nextCount++] = s;
                  }
                  if (!isTouched[s]) {
                    isTouched[s] = 1;
                    touched[touchedCount++] = s;
                  }
                }
              }
            }
            if (i === n - 1) break;
            const ready = tau[prevBase + s];
            if (ready >= UNREACHED) continue;
            if (trip >= 0 && ready > times[tripBase + i]) continue;
            // Earliest trip departing stop i at or after `ready`; only trips before the
            // current one can improve on it (trips are FIFO), so binary-search those.
            let lo = 0;
            let hi = trip >= 0 ? trip : tripCount;
            while (lo < hi) {
              const mid = (lo + hi) >>> 1;
              if (times[base + mid * n + i] >= ready) hi = mid;
              else lo = mid + 1;
            }
            if (lo < (trip >= 0 ? trip : tripCount)) {
              trip = lo;
              tripBase = base + trip * n;
              boardIdx = i;
            }
          }
        }

        // Footpaths from vehicle arrivals of this round (never chained).
        for (let m = 0; m < routeMarkedCount; m++) {
          const s = routeMarked[m];
          isRouteMarked[s] = -1;
          const arrS = routeMarkedArr[m];
          for (let e = transferOffset[s]; e < transferOffset[s + 1]; e++) {
            const u = transferTo[e];
            const arr = arrS + transferSeconds[e];
            if (arr < tauStar[u]) {
              tau[curBase + u] = arr;
              tauStar[u] = arr;
              if (track) {
                starKind[u] = LEG_WALK;
                starFrom[u] = s;
              }
              if (!isNextMarked[u]) {
                isNextMarked[u] = 1;
                nextMarked[nextCount++] = u;
              }
              if (!isTouched[u]) {
                isTouched[u] = 1;
                touched[touchedCount++] = u;
              }
            }
          }
        }

        // Swap marked sets.
        for (let m = 0; m < nextCount; m++) isNextMarked[nextMarked[m]] = 0;
        const tmp = marked;
        marked = nextMarked;
        nextMarked = tmp;
        markedCount = nextCount;
      }

      // Fold this departure into the best travel times (departures after the window only feed `typical`).
      for (let m = 0; m < touchedCount; m++) {
        const s = touched[m];
        isTouched[s] = 0;
        if (typical) {
          settle(s, dep);
          since[s] = dep;
          lastValue[s] = tauStar[s];
        }
        const t = tauStar[s] - dep;
        if (dep <= we && t < best[s]) {
          best[s] = t;
          if (track) {
            legKind[s] = starKind[s];
            legFrom[s] = starFrom[s];
            legTo[s] = starTo[s];
          }
        }
      }
      touchedCount = 0;
    }
  }

  let typicalSeconds: Float32Array | undefined;
  if (typical) {
    typicalSeconds = new Float32Array(S).fill(Infinity);
    for (let s = 0; s < S; s++) {
      if (since[s] < Infinity) settle(s, -Infinity);
      const covered = coverEnd[s] - ws;
      let v = since[s] < Infinity && covered > 0 ? integral[s] / covered : Infinity;
      // Walking straight from the origin needs no waiting, so it caps the average.
      if (walkOnly[s] < v) v = walkOnly[s];
      typicalSeconds[s] = v;
    }
  }

  return {
    stopSeconds: best,
    ...(typicalSeconds ? { typicalSeconds } : {}),
    computedInMs: now() - t0,
    origin: { lat: origin.lat, lon: origin.lon },
    departures: departures.length,
    ...(track ? { legs: { kind: legKind, from: legFrom, to: legTo } } : {}),
  };
}

/**
 * Distinct origin departure times in [windowStart, windowEnd], latest first:
 * every trip departure from an access stop minus the walk to that stop.
 */
function departureTimes(
  tt: PreparedTimetable,
  accessStops: number[],
  accessWalk: number[],
  horizon = 0,
): Int32Array {
  const {
    routeStopOffset,
    routeTripCount,
    routeTimeOffset,
    times,
    stopRouteOffset,
    stopRouteRoute,
    stopRouteIndex,
  } = tt;
  const lo = tt.windowStart;
  const hi = tt.windowEnd + horizon;
  const out: number[] = [];
  for (let a = 0; a < accessStops.length; a++) {
    const s = accessStops[a];
    const walk = accessWalk[a];
    for (let e = stopRouteOffset[s]; e < stopRouteOffset[s + 1]; e++) {
      const r = stopRouteRoute[e];
      const i = stopRouteIndex[e];
      const n = routeStopOffset[r + 1] - routeStopOffset[r];
      if (i === n - 1) continue; // cannot board at the last stop
      const base = routeTimeOffset[r];
      for (let t = 0; t < routeTripCount[r]; t++) {
        const dep = times[base + t * n + i] - walk;
        if (dep >= lo && dep <= hi) out.push(dep);
      }
    }
  }
  const arr = Int32Array.from(out).sort();
  // Unique, descending.
  const res: number[] = [];
  for (let k = arr.length - 1; k >= 0; k--) {
    if (res.length === 0 || res[res.length - 1] !== arr[k]) res.push(arr[k]);
  }
  return Int32Array.from(res);
}
