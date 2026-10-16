import { LEG_WALK } from './raptor';
import type { PreparedTimetable } from './prepare';
import type { HeatGrid, RouteMode, StopProfile, TravelTimeResult } from './types';

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

  return segments(tt, ride, reachable, minShare);
}

/**
 * routeUsage for a map to a destination with a time to leave (goal.ts): the parts of the
 * network the trips its cells take ride. `cells` holds, per event of `profile` (made with
 * `trackLegs`), the cells taking it (goalCells, or a stop's pick from goalWindow); each
 * event sends that weight back along its journey, event by event of the same departure.
 */
export function goalUsage(
  tt: PreparedTimetable,
  profile: StopProfile,
  cells: Float64Array,
  grid: HeatGrid,
  opts: RouteUsageOptions = {},
): UsedSegment[] {
  const legs = profile.legs;
  if (!legs) throw new Error('goalUsage needs a profile made with trackLegs');
  const minShare = opts.minShare ?? 0.01;
  const { routeStopOffset, routeStops } = tt;
  const { offset, departure, arrival } = profile;
  let reachable = 0;
  for (let k = 0; k < grid.seconds.length; k++) if (grid.seconds[k] < Infinity) reachable++;
  // The event of stop `s` for origin departure `dep` (a stop's departures fall); -1 if none.
  const eventAt = (s: number, dep: number) => {
    let lo = offset[s];
    let hi = offset[s + 1];
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (departure[mid] > dep) lo = mid + 1;
      else hi = mid;
    }
    return lo < offset[s + 1] && departure[lo] === dep ? lo : -1;
  };
  // Latest arrival first (a leg's stop before it is reached earlier). Weight that comes
  // to an event already passed on (equal arrivals) is passed on when it comes.
  const weight = Float64Array.from(cells);
  const heap = new EventHeap(arrival);
  for (let i = 0; i < weight.length; i++) if (weight[i] > 0) heap.push(i);
  const ride = new Float64Array(routeStops.length + 1);
  // A guard only: legs never lead back to a later arrival, so no event comes round again.
  for (let pops = 0; heap.size > 0 && pops < 4 * weight.length; pops++) {
    const i = heap.pop();
    const w = weight[i];
    if (w === 0) continue;
    weight[i] = 0;
    const kind = legs.kind[i];
    let before: number;
    if (kind >= 0) {
      const so = routeStopOffset[kind];
      ride[so + legs.from[i]] += w;
      ride[so + legs.to[i]] -= w;
      before = routeStops[so + legs.from[i]];
    } else if (kind === LEG_WALK) {
      before = legs.from[i];
    } else continue;
    const j = eventAt(before, departure[i]);
    if (j < 0 || arrival[j] > arrival[i]) continue;
    if (weight[j] === 0) heap.push(j);
    weight[j] += w;
  }
  return segments(tt, ride, reachable, minShare);
}

/** Event indices, the latest arrival on top. */
class EventHeap {
  private items = new Int32Array(1 << 12);
  size = 0;
  private readonly key: Int32Array;
  constructor(key: Int32Array) {
    this.key = key;
  }

  push(i: number) {
    if (this.size === this.items.length) {
      const bigger = new Int32Array(this.size * 2);
      bigger.set(this.items);
      this.items = bigger;
    }
    const { items, key } = this;
    let at = this.size++;
    while (at > 0) {
      const up = (at - 1) >> 1;
      if (key[items[up]] >= key[i]) break;
      items[at] = items[up];
      at = up;
    }
    items[at] = i;
  }

  pop(): number {
    const { items, key } = this;
    const top = items[0];
    const last = items[--this.size];
    let at = 0;
    for (;;) {
      let child = 2 * at + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && key[items[child + 1]] > key[items[child]]) child++;
      if (key[items[child]] <= key[last]) break;
      items[at] = items[child];
      at = child;
    }
    items[at] = last;
    return top;
  }
}

/** The ridden hops of `ride` (a difference array over route positions) as UsedSegments. */
function segments(
  tt: PreparedTimetable,
  ride: Float64Array,
  reachable: number,
  minShare: number,
): UsedSegment[] {
  const S = tt.stopCount;
  const { routeStopOffset, routeStops } = tt;
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
