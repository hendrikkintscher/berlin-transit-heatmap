import { makeProjection, type LocalProjection } from './geo';
import type { RouteMode, Stop, Timetable } from './types';

/** Integer stand-in for "not reached" in the Int32 label arrays. */
export const UNREACHED = 0x3fffffff;

/** Edge length of the stop spatial-index buckets, in metres. */
const BUCKET_M = 500;

/**
 * A timetable converted into flat typed arrays for fast scanning. Built once
 * per timetable by `loadTimetable` and reused for every origin.
 *
 * Routes here are FIFO sub-routes: a Contract 1 route whose trips overtake one
 * another is split so that, within each sub-route, a later trip never departs
 * any stop before an earlier one. RAPTOR's "earliest catchable trip" search
 * relies on that.
 */
export interface PreparedTimetable {
  readonly window: Timetable['window'];
  readonly serviceDate: string;
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly feedVersion: string;
  readonly stops: readonly Stop[];
  readonly stopCount: number;
  readonly stopLat: Float64Array;
  readonly stopLon: Float64Array;
  /** Stop position in metres in the local projection `proj`. */
  readonly stopX: Float64Array;
  readonly stopY: Float64Array;
  readonly proj: LocalProjection;

  readonly routeCount: number;
  /** Original Contract 1 route index of each sub-route. */
  readonly routeSource: Int32Array;
  readonly routeNames: readonly string[];
  readonly routeModes: readonly RouteMode[];
  /** routeStops[routeStopOffset[r] .. routeStopOffset[r+1]) = stop indices of route r. */
  readonly routeStopOffset: Int32Array;
  readonly routeStops: Int32Array;
  readonly routeTripCount: Int32Array;
  /** times[routeTimeOffset[r] + trip * stopsInRoute + i] = departure of `trip` at stop i. */
  readonly routeTimeOffset: Int32Array;
  readonly times: Int32Array;

  /** For stop s: entries [stopRouteOffset[s], stopRouteOffset[s+1]) of (route, index of s in the route). */
  readonly stopRouteOffset: Int32Array;
  readonly stopRouteRoute: Int32Array;
  readonly stopRouteIndex: Int32Array;

  /** Footpaths out of stop s: [transferOffset[s], transferOffset[s+1]). */
  readonly transferOffset: Int32Array;
  readonly transferTo: Int32Array;
  readonly transferSeconds: Int32Array;

  /** Uniform bucket grid over stop positions, for radius queries. */
  readonly index: StopIndex;
}

export interface StopIndex {
  readonly bucketM: number;
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  /** Stops of bucket b: bucketStops[bucketOffset[b] .. bucketOffset[b+1]). */
  readonly bucketOffset: Int32Array;
  readonly bucketStops: Int32Array;
}

export function loadTimetable(json: Timetable): PreparedTimetable {
  if (json.version !== 1) throw new Error(`Unsupported timetable version ${String(json.version)}`);
  const stopCount = json.stops.length;

  // Stops and projection.
  const stopLat = new Float64Array(stopCount);
  const stopLon = new Float64Array(stopCount);
  let latSum = 0;
  let lonSum = 0;
  for (let s = 0; s < stopCount; s++) {
    const stop = json.stops[s];
    stopLat[s] = stop.lat;
    stopLon[s] = stop.lon;
    latSum += stop.lat;
    lonSum += stop.lon;
  }
  const proj =
    stopCount > 0
      ? makeProjection(latSum / stopCount, lonSum / stopCount)
      : makeProjection(52.52, 13.4);
  const stopX = new Float64Array(stopCount);
  const stopY = new Float64Array(stopCount);
  for (let s = 0; s < stopCount; s++) {
    stopX[s] = (stopLon[s] - proj.lon0) * proj.mPerLon;
    stopY[s] = (stopLat[s] - proj.lat0) * proj.mPerLat;
  }

  // Routes, split into FIFO sub-routes.
  interface SubRoute {
    source: number;
    stops: number[];
    trips: number[][];
  }
  const subRoutes: SubRoute[] = [];
  for (let r = 0; r < json.routes.length; r++) {
    const route = json.routes[r];
    const n = route.stops.length;
    if (n < 2 || route.trips.length === 0) continue;
    for (const s of route.stops) {
      if (!(s >= 0 && s < stopCount))
        throw new Error(`Route ${r} (${route.name}) references unknown stop ${s}`);
    }
    const trips = route.trips
      .filter((t) => t.length === n)
      .map((t) => monotone(t))
      .sort((a, b) => a[0] - b[0] || a[n - 1] - b[n - 1]);
    const groups: number[][][] = [];
    for (const trip of trips) {
      let placed = false;
      for (const g of groups) {
        const last = g[g.length - 1];
        let fifo = true;
        for (let i = 0; i < n; i++) {
          if (trip[i] < last[i]) {
            fifo = false;
            break;
          }
        }
        if (fifo) {
          g.push(trip);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push([trip]);
    }
    for (const g of groups) subRoutes.push({ source: r, stops: route.stops, trips: g });
  }

  const routeCount = subRoutes.length;
  const routeSource = new Int32Array(routeCount);
  const routeStopOffset = new Int32Array(routeCount + 1);
  const routeTripCount = new Int32Array(routeCount);
  const routeTimeOffset = new Int32Array(routeCount + 1);
  let totalStops = 0;
  let totalTimes = 0;
  for (let r = 0; r < routeCount; r++) {
    const sr = subRoutes[r];
    routeSource[r] = sr.source;
    routeStopOffset[r] = totalStops;
    routeTimeOffset[r] = totalTimes;
    routeTripCount[r] = sr.trips.length;
    totalStops += sr.stops.length;
    totalTimes += sr.stops.length * sr.trips.length;
  }
  routeStopOffset[routeCount] = totalStops;
  routeTimeOffset[routeCount] = totalTimes;
  const routeStops = new Int32Array(totalStops);
  const times = new Int32Array(totalTimes);
  for (let r = 0; r < routeCount; r++) {
    const sr = subRoutes[r];
    routeStops.set(sr.stops, routeStopOffset[r]);
    let o = routeTimeOffset[r];
    for (const trip of sr.trips) {
      times.set(trip, o);
      o += trip.length;
    }
  }
  const routeNames = subRoutes.map((sr) => json.routes[sr.source].name);
  const routeModes = subRoutes.map((sr) => json.routes[sr.source].mode);

  // Stop -> (route, index) lookup, CSR.
  const stopRouteOffset = new Int32Array(stopCount + 1);
  for (let i = 0; i < totalStops; i++) stopRouteOffset[routeStops[i] + 1]++;
  for (let s = 0; s < stopCount; s++) stopRouteOffset[s + 1] += stopRouteOffset[s];
  const stopRouteRoute = new Int32Array(totalStops);
  const stopRouteIndex = new Int32Array(totalStops);
  {
    const fill = stopRouteOffset.slice(0, stopCount);
    for (let r = 0; r < routeCount; r++) {
      const start = routeStopOffset[r];
      const end = routeStopOffset[r + 1];
      for (let i = start; i < end; i++) {
        const s = routeStops[i];
        const k = fill[s]++;
        stopRouteRoute[k] = r;
        stopRouteIndex[k] = i - start;
      }
    }
  }

  // Footpaths, CSR. Duplicates keep the shortest; self-loops are dropped.
  const transferOffset = new Int32Array(stopCount + 1);
  const valid = json.transfers.filter(
    (t) =>
      t.from !== t.to &&
      t.from >= 0 &&
      t.from < stopCount &&
      t.to >= 0 &&
      t.to < stopCount &&
      t.seconds >= 0,
  );
  for (const t of valid) transferOffset[t.from + 1]++;
  for (let s = 0; s < stopCount; s++) transferOffset[s + 1] += transferOffset[s];
  const transferTo = new Int32Array(valid.length);
  const transferSeconds = new Int32Array(valid.length);
  {
    const fill = transferOffset.slice(0, stopCount);
    for (const t of valid) {
      const k = fill[t.from]++;
      transferTo[k] = t.to;
      transferSeconds[k] = Math.round(t.seconds);
    }
  }

  return {
    window: json.window,
    serviceDate: json.serviceDate,
    windowStart: json.windowStart,
    windowEnd: json.windowEnd,
    feedVersion: json.feedVersion,
    stops: json.stops,
    stopCount,
    stopLat,
    stopLon,
    stopX,
    stopY,
    proj,
    routeCount,
    routeSource,
    routeNames,
    routeModes,
    routeStopOffset,
    routeStops,
    routeTripCount,
    routeTimeOffset,
    times,
    stopRouteOffset,
    stopRouteRoute,
    stopRouteIndex,
    transferOffset,
    transferTo,
    transferSeconds,
    index: buildIndex(stopX, stopY),
  };
}

/** Clamp a trip so its times never decrease along the route (guards against bad data). */
function monotone(trip: number[]): number[] {
  const out = new Array<number>(trip.length);
  let prev = -Infinity;
  for (let i = 0; i < trip.length; i++) {
    const t = Math.round(trip[i]);
    prev = t > prev ? t : prev;
    out[i] = prev;
  }
  return out;
}

function buildIndex(xs: Float64Array, ys: Float64Array): StopIndex {
  const n = xs.length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let s = 0; s < n; s++) {
    if (xs[s] < minX) minX = xs[s];
    if (xs[s] > maxX) maxX = xs[s];
    if (ys[s] < minY) minY = ys[s];
    if (ys[s] > maxY) maxY = ys[s];
  }
  if (n === 0) {
    minX = minY = 0;
    maxX = maxY = 0;
  }
  const cols = Math.max(1, Math.floor((maxX - minX) / BUCKET_M) + 1);
  const rows = Math.max(1, Math.floor((maxY - minY) / BUCKET_M) + 1);
  const bucketOffset = new Int32Array(cols * rows + 1);
  const bucketOf = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    const b = Math.floor((ys[s] - minY) / BUCKET_M) * cols + Math.floor((xs[s] - minX) / BUCKET_M);
    bucketOf[s] = b;
    bucketOffset[b + 1]++;
  }
  for (let b = 0; b < cols * rows; b++) bucketOffset[b + 1] += bucketOffset[b];
  const bucketStops = new Int32Array(n);
  const fill = bucketOffset.slice(0, cols * rows);
  for (let s = 0; s < n; s++) bucketStops[fill[bucketOf[s]]++] = s;
  return { bucketM: BUCKET_M, minX, minY, cols, rows, bucketOffset, bucketStops };
}

/**
 * Calls `visit(stop, distanceM)` for every stop within `radiusM` metres of the
 * projected point (x, y).
 */
export function forStopsWithin(
  tt: PreparedTimetable,
  x: number,
  y: number,
  radiusM: number,
  visit: (stop: number, distanceM: number) => void,
): void {
  const ix = tt.index;
  const c0 = Math.max(0, Math.floor((x - radiusM - ix.minX) / ix.bucketM));
  const c1 = Math.min(ix.cols - 1, Math.floor((x + radiusM - ix.minX) / ix.bucketM));
  const r0 = Math.max(0, Math.floor((y - radiusM - ix.minY) / ix.bucketM));
  const r1 = Math.min(ix.rows - 1, Math.floor((y + radiusM - ix.minY) / ix.bucketM));
  const r2 = radiusM * radiusM;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const b = r * ix.cols + c;
      for (let k = ix.bucketOffset[b]; k < ix.bucketOffset[b + 1]; k++) {
        const s = ix.bucketStops[k];
        const dx = tt.stopX[s] - x;
        const dy = tt.stopY[s] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) visit(s, Math.sqrt(d2));
      }
    }
  }
}
