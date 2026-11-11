// The whole network as faint lines by mode (S058): every hop of the hour's routes, chained
// into polylines per mode and drawn along the hops' courses (lines.bin). Built in the worker
// in small steps after the base map is up, and handed over as GeoJSON bytes, so the page
// only wraps them in a blob URL for MapLibre (which parses them in its own worker).
import type { PreparedTimetable, RouteMode } from '@berlin-transit-heatmap/routing';

/** The network's sources, each shown from its own zoom (map-layers.ts NETWORK_GROUPS). */
export type NetworkGroup = 'rail' | 'tram' | 'bus';
export const GROUP_OF: Record<RouteMode, NetworkGroup> = {
  sbahn: 'rail',
  ubahn: 'rail',
  regional: 'rail',
  tram: 'tram',
  ferry: 'tram',
  bus: 'bus',
  other: 'bus',
};
export const NETWORK_GROUP_NAMES: readonly NetworkGroup[] = ['rail', 'tram', 'bus'];
export type NetworkFiles = Record<NetworkGroup, ArrayBuffer>;

/** Routes read per step. */
const ROUTES_PER_STEP = 200;

/** Hops of each mode, keyed a * stopCount + b with a < b. */
export function networkHops(tt: PreparedTimetable): Map<RouteMode, Set<number>> {
  const steps = hopsInSteps(tt);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

export function* hopsInSteps(tt: PreparedTimetable): Generator<void, Map<RouteMode, Set<number>>> {
  const out = new Map<RouteMode, Set<number>>();
  for (let r = 0; r < tt.routeCount; r++) {
    if (r % ROUTES_PER_STEP === ROUTES_PER_STEP - 1) yield;
    const mode = tt.routeModes[r]!;
    let set = out.get(mode);
    if (!set) out.set(mode, (set = new Set()));
    for (let i = tt.routeStopOffset[r]! + 1; i < tt.routeStopOffset[r + 1]!; i++) {
      const x = tt.routeStops[i - 1]!;
      const y = tt.routeStops[i]!;
      if (x !== y) set.add(x < y ? x * tt.stopCount + y : y * tt.stopCount + x);
    }
  }
  return out;
}

/** A cheap fingerprint of the hops, so a map from another hour redraws only when they differ. */
export function hopsKey(hops: Map<RouteMode, Set<number>>): string {
  const parts: string[] = [];
  for (const [mode, set] of [...hops].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    let sum = 0;
    let mix = 0;
    for (const k of set) {
      sum += k;
      mix = (mix + Math.imul(k, 2654435761)) | 0;
    }
    parts.push(`${mode}:${set.size}:${sum}:${mix}`);
  }
  return parts.join(' ');
}

/**
 * Chains undirected hops into paths of stops: each path runs between ends or junctions
 * (stops with other than two hops), and loops left over become paths of their own.
 */
export function chainHops(pairs: readonly (readonly [number, number])[]): number[][] {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const l = adj.get(a);
    if (l) l.push(b);
    else adj.set(a, [b]);
  };
  for (const [a, b] of pairs) {
    link(a, b);
    link(b, a);
  }
  const used = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const walk = (start: number, next: number) => {
    const path = [start];
    let prev = start;
    let cur = next;
    for (;;) {
      used.add(key(prev, cur));
      path.push(cur);
      const nbrs = adj.get(cur)!;
      if (nbrs.length !== 2) break;
      const nxt = nbrs[0] === prev ? nbrs[1]! : nbrs[0]!;
      if (used.has(key(cur, nxt))) break;
      prev = cur;
      cur = nxt;
    }
    return path;
  };
  // Ends and junctions first, then whatever is left (loops).
  const starts = [...adj.keys()].sort(
    (x, y) => Number(adj.get(x)!.length === 2) - Number(adj.get(y)!.length === 2),
  );
  const out: number[][] = [];
  for (const a of starts)
    for (const b of adj.get(a)!) if (!used.has(key(a, b))) out.push(walk(a, b));
  return out;
}

/** Paths turned into GeoJSON text per step, so a tap waits one slice at most. */
const PATHS_PER_STEP = 150;
const round = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * The network's GeoJSON files, one per group, in steps (run with inSlices). `courseOf`
 * gives a path's [lon, lat] points along the hops' courses.
 */
export function* networkInSteps(
  tt: PreparedTimetable,
  hops: Map<RouteMode, Set<number>>,
  courseOf: (stops: number[]) => [number, number][],
): Generator<void, NetworkFiles> {
  const parts: Record<NetworkGroup, string[]> = { rail: [], tram: [], bus: [] };
  const n = tt.stopCount;
  for (const [mode, set] of hops) {
    const pairs: [number, number][] = [];
    for (const k of set) pairs.push([Math.floor(k / n), k % n]);
    const paths = chainHops(pairs);
    yield;
    const into = parts[GROUP_OF[mode]];
    for (let i = 0; i < paths.length; i++) {
      const coords = courseOf(paths[i]!)
        .map(([lon, lat]) => `[${round(lon)},${round(lat)}]`)
        .join(',');
      into.push(
        `{"type":"Feature","properties":{"mode":"${mode}"},"geometry":{"type":"LineString","coordinates":[${coords}]}}`,
      );
      if (i % PATHS_PER_STEP === PATHS_PER_STEP - 1) yield;
    }
  }
  const enc = new TextEncoder();
  const file = (g: NetworkGroup) =>
    enc.encode(`{"type":"FeatureCollection","features":[${parts[g].join(',')}]}`)
      .buffer as ArrayBuffer;
  const rail = file('rail');
  yield;
  const tram = file('tram');
  yield;
  return { rail, tram, bus: file('bus') };
}
