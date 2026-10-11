import { LEG_WALK } from './raptor';
import type { PreparedTimetable } from './prepare';
import type { HeatGrid, RouteMode, TravelTimeResult } from './types';

/** One stop-to-stop hop of the transit network and how much of the map is reached over it. */
export interface UsedSegment {
  /** Stop indices; the pair is unordered (a < b). */
  a: number;
  b: number;
  /** Number of grid cells whose fastest journey rides this hop. */
  cells: number;
  /** cells / all reachable cells (0..1). */
  share: number;
  /** Mode of the line carrying most of the weight. */
  mode: RouteMode;
  /** Route names on this hop, heaviest first. */
  names: string[];
}

export interface RouteUsageOptions {
  /** Drop hops carrying less than this share of reachable cells. Default 0.01. */
  minShare?: number;
}

/**
 * Which parts of the network the fastest journeys from the origin rely on.
 * Every reachable grid cell sends one unit of weight back along its journey
 * tree (cell -> stop -> legs -> origin); each ridden hop sums the weight of
 * all cells behind it. Needs `travelTimes(..., { trackLegs: true })` and
 * `heatGrid(..., { trackStops: true })`.
 */
export function routeUsage(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  grid: HeatGrid,
  opts: RouteUsageOptions = {},
): UsedSegment[] {
  const legs = result.legs;
  const cellStop = grid.stop;
  if (!legs || !cellStop) throw new Error('routeUsage needs trackLegs and trackStops results');
  const minShare = opts.minShare ?? 0.01;
  const S = tt.stopCount;
  const { routeStopOffset, routeStops } = tt;

  // Cells per stop.
  const weight = new Float64Array(S);
  for (let k = 0; k < cellStop.length; k++) {
    const s = cellStop[k];
    if (s >= 0) weight[s]++;
  }

  let reachable = 0;
  for (let k = 0; k < grid.seconds.length; k++) if (grid.seconds[k] < Infinity) reachable++;

  // Push weight towards the origin, slowest stops first (a parent is always faster).
  const best = result.stopSeconds;
  const order: number[] = [];
  for (let s = 0; s < S; s++) if (legs.kind[s] >= LEG_WALK) order.push(s);
  order.sort((x, y) => best[y] - best[x]);
  // Difference array over route positions: positions from..to-1 of the ridden route get the weight.
  const ride = new Float64Array(routeStops.length + 1);
  for (const s of order) {
    const w = weight[s];
    if (w === 0) continue;
    const kind = legs.kind[s];
    if (kind >= 0) {
      const so = routeStopOffset[kind];
      ride[so + legs.from[s]] += w;
      ride[so + legs.to[s]] -= w;
      weight[routeStops[so + legs.from[s]]] += w;
    } else {
      weight[legs.from[s]] += w;
    }
  }

  // Sum per unordered stop pair, keeping per-line weight for mode and names.
  const pairs = new Map<number, { cells: number; byName: Map<string, number> }>();
  const modeOf = new Map<string, RouteMode>();
  for (let r = 0; r < tt.routeCount; r++) {
    const so = routeStopOffset[r];
    const n = routeStopOffset[r + 1] - so;
    const name = tt.routeNames[r];
    modeOf.set(name, tt.routeModes[r]);
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      acc += ride[so + i];
      if (acc < 0.5) continue;
      const u = routeStops[so + i];
      const v = routeStops[so + i + 1];
      if (u === v) continue;
      const key = u < v ? u * S + v : v * S + u;
      let p = pairs.get(key);
      if (!p) pairs.set(key, (p = { cells: 0, byName: new Map() }));
      p.cells += acc;
      p.byName.set(name, (p.byName.get(name) ?? 0) + acc);
    }
  }

  const total = Math.max(1, reachable);
  const out: UsedSegment[] = [];
  for (const [key, p] of pairs) {
    const share = p.cells / total;
    if (share < minShare) continue;
    const names = [...p.byName].sort((x, y) => y[1] - x[1]).map(([n]) => n);
    out.push({
      a: Math.floor(key / S),
      b: key % S,
      cells: Math.round(p.cells),
      share,
      mode: modeOf.get(names[0]) ?? 'other',
      names,
    });
  }
  return out.sort((x, y) => y.cells - x.cells);
}
