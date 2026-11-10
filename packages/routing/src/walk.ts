import { M_PER_DEG_LAT, metresPerDegLon, WALK_SPEED_MPS } from './geo';
import type { PreparedTimetable } from './prepare';
import { decodeWalkBinInSteps, inPieces } from './walkbin';

/**
 * Contract 3: the walking network (`walk.bin`, format in walkbin.ts), built by
 * timetable-build from OpenStreetMap footpaths and streets.
 */

/** Default walking speed on the footpath network, 4 km/h (Hendrik's choice; the app lets people change it). */
export const NETWORK_WALK_SPEED_MPS = 4 / 3.6;
/**
 * Straight lines (no network, or points far from it) are this much shorter than the
 * walk along streets, so they are walked this much slower to match.
 */
export const DETOUR_FACTOR = 1.25;
/** Points further than this from the network are not snapped to it. */
export const MAX_SNAP_M = 300;
/** Grid cells snap further, so fields, woods and lakeshores get the walk across them. */
export const MAX_CELL_SNAP_M = 1000;
/** Edge buckets for snapping points (100 m: a fourth of the memory of 50 m, as fast). */
const BUCKET_M = 100;

/**
 * Walking speeds for a chosen network speed: on the network, and in a straight line
 * (no network, or points far from it). Without a choice the straight line keeps the
 * plan's 1.2 m/s and the network uses NETWORK_WALK_SPEED_MPS.
 */
export function walkSpeeds(networkMps?: number): { network: number; straight: number } {
  if (networkMps === undefined || !(networkMps > 0))
    return { network: NETWORK_WALK_SPEED_MPS, straight: WALK_SPEED_MPS };
  return { network: networkMps, straight: networkMps / DETOUR_FACTOR };
}

export interface WalkNetwork {
  readonly nodeCount: number;
  /** Node position in metres from (lat0, lon0); nodeLonLat gives it in degrees. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly lat0: number;
  readonly lon0: number;
  readonly mPerLon: number;
  /** Neighbours of node v: target[offset[v] .. offset[v+1]), with the length in metres. */
  readonly offset: Int32Array;
  readonly target: Int32Array;
  readonly metres: Float32Array;
  /** The undirected edges, each once, with their length in metres. */
  readonly edgeCount: number;
  readonly edgeA: Int32Array;
  readonly edgeB: Int32Array;
  readonly edgeMetres: Float32Array;
  /** Bucket grid over the edges (each listed in every bucket its bounding box touches). */
  readonly bucketCols: number;
  readonly bucketRows: number;
  readonly bucketOffset: Int32Array;
  readonly bucketEdges: Int32Array;
}

export function loadWalkNetwork(data: ArrayBuffer | Uint8Array): WalkNetwork {
  return finish(loadWalkNetworkInSteps(data));
}

/** Runs a generator made of steps to its end. */
function finish<T>(steps: Generator<void, T>): T {
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/**
 * loadWalkNetwork in steps: the generator pauses every millisecond or so, so a worker can
 * answer other messages in between (see snapCellsInSteps).
 */
export function* loadWalkNetworkInSteps(
  data: ArrayBuffer | Uint8Array,
): Generator<void, WalkNetwork> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const { lat, lon, edgeA: ea, edgeB: eb, edgeM: em } = yield* decodeWalkBinInSteps(buf);
  const n = lat.length;
  const m = ea.length;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  yield* inPieces(n, (from, to) => {
    let [a, b, c, d] = [minLat, maxLat, minLon, maxLon];
    for (let i = from; i < to; i++) {
      if (lat[i] < a) a = lat[i];
      if (lat[i] > b) b = lat[i];
      if (lon[i] < c) c = lon[i];
      if (lon[i] > d) d = lon[i];
    }
    [minLat, maxLat, minLon, maxLon] = [a, b, c, d];
  });
  const degree = new Int32Array(n + 1);
  yield* inPieces(m, (from, to) => {
    for (let k = from; k < to; k++) {
      degree[ea[k] + 1]++;
      degree[eb[k] + 1]++;
    }
  });

  const offset = degree;
  for (let v = 0; v < n; v++) offset[v + 1] += offset[v];
  const fill = offset.slice(0, n);
  const target = new Int32Array(2 * m);
  const metres = new Float32Array(2 * m);
  const edgeMetres = new Float32Array(m);
  yield* inPieces(m, (from, to) => {
    for (let k = from; k < to; k++) {
      const s = em[k];
      edgeMetres[k] = s;
      target[fill[ea[k]]] = eb[k];
      metres[fill[ea[k]]++] = s;
      target[fill[eb[k]]] = ea[k];
      metres[fill[eb[k]]++] = s;
    }
  });

  const lat0 = n ? minLat : 0;
  const lon0 = n ? minLon : 0;
  const mPerLon = metresPerDegLon((minLat + maxLat) / 2 || 52.5);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  yield* inPieces(n, (from, to) => {
    for (let i = from; i < to; i++) {
      x[i] = (lon[i] - lon0) * mPerLon;
      y[i] = (lat[i] - lat0) * M_PER_DEG_LAT;
    }
  });
  const bucketCols = n ? Math.floor(((maxLon - lon0) * mPerLon) / BUCKET_M) + 1 : 1;
  const bucketRows = n ? Math.floor(((maxLat - lat0) * M_PER_DEG_LAT) / BUCKET_M) + 1 : 1;
  const bucketOffset = new Int32Array(bucketCols * bucketRows + 1);
  const eachBucket = (k: number, visit: (b: number) => void) => {
    const c0 = Math.floor(Math.min(x[ea[k]], x[eb[k]]) / BUCKET_M);
    const c1 = Math.floor(Math.max(x[ea[k]], x[eb[k]]) / BUCKET_M);
    const r0 = Math.floor(Math.min(y[ea[k]], y[eb[k]]) / BUCKET_M);
    const r1 = Math.floor(Math.max(y[ea[k]], y[eb[k]]) / BUCKET_M);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * bucketCols + c);
  };
  yield* inPieces(m, (from, to) => {
    for (let k = from; k < to; k++) eachBucket(k, (b) => bucketOffset[b + 1]++);
  });
  for (let b = 0; b < bucketCols * bucketRows; b++) bucketOffset[b + 1] += bucketOffset[b];
  const bfill = bucketOffset.slice(0, bucketCols * bucketRows);
  const bucketEdges = new Int32Array(bucketOffset[bucketCols * bucketRows]);
  yield* inPieces(m, (from, to) => {
    for (let k = from; k < to; k++) eachBucket(k, (b) => (bucketEdges[bfill[b]++] = k));
  });

  return {
    nodeCount: n,
    x,
    y,
    lat0,
    lon0,
    mPerLon,
    offset,
    target,
    metres,
    edgeCount: m,
    edgeA: ea,
    edgeB: eb,
    edgeMetres,
    bucketCols,
    bucketRows,
    bucketOffset,
    bucketEdges,
  };
}

/** Node v's position as [lon, lat] (from its metres, to a few millimetres). */
export function nodeLonLat(net: WalkNetwork, v: number): [number, number] {
  return [net.lon0 + net.x[v]! / net.mPerLon, net.lat0 + net.y[v]! / M_PER_DEG_LAT];
}

/** Where points meet the network: the nearest edge (-1 if none within MAX_SNAP_M),
 * how far along it from edgeA (0..1), and the distance from the point to it in metres. */
export interface Snaps {
  edge: Int32Array;
  along: Float32Array;
  metres: Float32Array;
}

function makeSnaps(n: number): Snaps {
  return {
    edge: new Int32Array(n).fill(-1),
    along: new Float32Array(n),
    metres: new Float32Array(n).fill(Infinity),
  };
}

/** Snaps point (lat, lon) into slot i of `out`. */
export function snapPoint(
  net: WalkNetwork,
  lat: number,
  lon: number,
  out: Snaps,
  i = 0,
  maxM: number = MAX_SNAP_M,
): void {
  const px = (lon - net.lon0) * net.mPerLon;
  const py = (lat - net.lat0) * M_PER_DEG_LAT;
  const bc = Math.floor(px / BUCKET_M);
  const br = Math.floor(py / BUCKET_M);
  const { x, y, edgeA, edgeB, bucketOffset, bucketEdges, bucketCols, bucketRows } = net;
  let best = -1;
  let bestD2 = maxM * maxM;
  let bestF = 0;
  const maxRing = Math.ceil(maxM / BUCKET_M);
  for (let ring = 0; ring <= maxRing; ring++) {
    // Nothing in a further ring can beat a hit closer than the ring's inner edge.
    if (best >= 0 && (ring - 1) * BUCKET_M > Math.sqrt(bestD2)) break;
    for (let r = br - ring; r <= br + ring; r++) {
      if (r < 0 || r >= bucketRows) continue;
      const step = r === br - ring || r === br + ring ? 1 : 2 * ring || 1;
      for (let c = bc - ring; c <= bc + ring; c += step) {
        if (c < 0 || c >= bucketCols) continue;
        const b = r * bucketCols + c;
        for (let k = bucketOffset[b]; k < bucketOffset[b + 1]; k++) {
          const e = bucketEdges[k];
          const ax = x[edgeA[e]];
          const ay = y[edgeA[e]];
          const vx = x[edgeB[e]] - ax;
          const vy = y[edgeB[e]] - ay;
          const len2 = vx * vx + vy * vy;
          let f = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
          f = f < 0 ? 0 : f > 1 ? 1 : f;
          const dx = ax + f * vx - px;
          const dy = ay + f * vy - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = e;
            bestF = f;
          }
        }
      }
    }
  }
  out.edge[i] = best;
  out.along[i] = bestF;
  out.metres[i] = best >= 0 ? Math.sqrt(bestD2) : Infinity;
}

/**
 * A place snaps to more than its nearest edge: also to other edges at most this much further
 * away. The nearest is often a cut-off path (a courtyard, a fenced footway) that reaches the
 * street only far round; with the street a few metres further as a second way in, the walk
 * takes whichever is shorter (S054).
 */
export const SNAP_SPREAD_M = 30;
/** At most this many edges per place (the nearest and the next ones not touching it). */
export const SNAP_EDGES = 4;

/**
 * Snaps a place to its nearest edge (slot 0) and to up to SNAP_EDGES - 1 more within
 * SNAP_SPREAD_M of that one's distance, nearest first; an edge sharing an end with one already
 * taken is skipped (it is the same path going on). Unused slots have edge -1.
 */
export function snapNear(
  net: WalkNetwork,
  lat: number,
  lon: number,
  maxM: number = MAX_SNAP_M,
  spreadM: number = SNAP_SPREAD_M,
  count: number = SNAP_EDGES,
): Snaps {
  const out = makeSnaps(count);
  snapPoint(net, lat, lon, out, 0, maxM);
  const e0 = out.edge[0];
  if (e0 < 0 || count < 2) return out;
  const reach = Math.min(maxM, out.metres[0] + spreadM);
  const px = (lon - net.lon0) * net.mPerLon;
  const py = (lat - net.lat0) * M_PER_DEG_LAT;
  const { x, y, edgeA, edgeB, bucketOffset, bucketEdges, bucketCols, bucketRows } = net;
  const c0 = Math.max(0, Math.floor((px - reach) / BUCKET_M));
  const c1 = Math.min(bucketCols - 1, Math.floor((px + reach) / BUCKET_M));
  const r0 = Math.max(0, Math.floor((py - reach) / BUCKET_M));
  const r1 = Math.min(bucketRows - 1, Math.floor((py + reach) / BUCKET_M));
  const found: { e: number; f: number; d: number }[] = [];
  const seen = new Set<number>([e0]);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const b = r * bucketCols + c;
      for (let k = bucketOffset[b]; k < bucketOffset[b + 1]; k++) {
        const e = bucketEdges[k];
        if (seen.has(e)) continue;
        seen.add(e);
        const ax = x[edgeA[e]];
        const ay = y[edgeA[e]];
        const vx = x[edgeB[e]] - ax;
        const vy = y[edgeB[e]] - ay;
        const len2 = vx * vx + vy * vy;
        let f = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
        f = f < 0 ? 0 : f > 1 ? 1 : f;
        const d = Math.hypot(ax + f * vx - px, ay + f * vy - py);
        if (d <= reach) found.push({ e, f, d });
      }
    }
  found.sort((p, q) => p.d - q.d || p.e - q.e);
  const ends = new Set<number>([edgeA[e0], edgeB[e0]]);
  let n = 1;
  for (const { e, f, d } of found) {
    if (n >= count) break;
    if (ends.has(edgeA[e]) || ends.has(edgeB[e])) continue;
    ends.add(edgeA[e]);
    ends.add(edgeB[e]);
    out.edge[n] = e;
    out.along[n] = f;
    out.metres[n] = d;
    n++;
  }
  return out;
}

/** An origin (or any tapped place) snapped to its nearby edges (snapNear). */
export function snapOrigin(net: WalkNetwork, origin: { lat: number; lon: number }): Snaps {
  return snapNear(net, origin.lat, origin.lon);
}

/** sameEdgeMetres from any slot of `a` (a place's snapNear) to slot j of `b`. */
export function sameEdgeMetresNear(net: WalkNetwork, a: Snaps, b: Snaps, j: number): number {
  let best = Infinity;
  for (let i = 0; i < a.edge.length; i++) {
    const m = sameEdgeMetres(net, a, i, b, j);
    if (m < best) best = m;
  }
  return best;
}

/**
 * The walk between two snapped points on the same edge, straight along it
 * (Infinity when they are on different edges). Going through the edge's ends,
 * as Dijkstra does, would overstate it.
 */
export function sameEdgeMetres(net: WalkNetwork, a: Snaps, i: number, b: Snaps, j: number): number {
  const e = a.edge[i];
  if (e < 0 || e !== b.edge[j]) return Infinity;
  return Math.abs(a.along[i] - b.along[j]) * net.edgeMetres[e] + a.metres[i] + b.metres[j];
}

/**
 * Grid cells on the network, kept per layout: each cell's edge (-1: none), the edge's two
 * ends and the walk from the cell to each (along the edge plus the way onto it). Where on
 * the edge a cell sits follows from those (see sameEdgeCellMetres), so it is not kept.
 */
export interface CellSnaps {
  edge: Int32Array;
  a: Int32Array;
  b: Int32Array;
  da: Float32Array;
  db: Float32Array;
}

function* cellEnds(net: WalkNetwork, cells: Snaps): Generator<void, CellSnaps> {
  const n = cells.edge.length;
  const a = new Int32Array(n).fill(-1);
  const b = new Int32Array(n).fill(-1);
  const da = new Float32Array(n);
  const db = new Float32Array(n);
  yield* inPieces(n, (from, to) => {
    for (let k = from; k < to; k++) {
      const e = cells.edge[k];
      if (e < 0) continue;
      const len = net.edgeMetres[e];
      const off = cells.metres[k];
      const d = cells.along[k] * len + off;
      a[k] = net.edgeA[e];
      b[k] = net.edgeB[e];
      da[k] = d;
      db[k] = len + 2 * off - d;
    }
  });
  return { edge: cells.edge, a, b, da, db };
}

/** sameEdgeMetres between snap slot i of `s` and grid cell k. */
export function sameEdgeCellMetres(
  net: WalkNetwork,
  s: Snaps,
  i: number,
  cells: CellSnaps,
  k: number,
): number {
  const e = s.edge[i];
  if (e < 0 || e !== cells.edge[k]) return Infinity;
  const len = net.edgeMetres[e];
  // da + db = len + 2 * off, and da = along * len + off.
  const off = Math.max(0, (cells.da[k] + cells.db[k] - len) / 2);
  return Math.abs(s.along[i] * len - (cells.da[k] - off)) + s.metres[i] + off;
}

const stopSnaps = new WeakMap<WalkNetwork, WeakMap<PreparedTimetable, Snaps>>();

/** Every stop snapped to the network, cached per network and timetable. */
export function snapStops(net: WalkNetwork, tt: PreparedTimetable): Snaps {
  return stopSnaps.get(net)?.get(tt) ?? finish(snapStopsInSteps(net, tt));
}

/** snapStops in steps, cached as snapStops caches it. */
export function* snapStopsInSteps(net: WalkNetwork, tt: PreparedTimetable): Generator<void, Snaps> {
  let byTt = stopSnaps.get(net);
  if (!byTt) stopSnaps.set(net, (byTt = new WeakMap()));
  const cached = byTt.get(tt);
  if (cached) return cached;
  const snap = makeSnaps(tt.stopCount);
  yield* inPieces(
    tt.stopCount,
    (from, to) => {
      for (let s = from; s < to; s++) snapPoint(net, tt.stopLat[s], tt.stopLon[s], snap, s);
    },
    256,
  );
  byTt.set(tt, snap);
  return snap;
}

/** Collects Dijkstra sources: a snapped point enters the network at both ends of its edge. */
export class WalkSources {
  nodes: number[] = [];
  times: number[] = [];
  walked: number[] = [];
  tags: number[] = [];
  /** Seconds per metre of walking. */
  readonly pace: number;
  constructor(pace: number) {
    this.pace = pace;
  }
  /** Adds every used slot of `snaps` (a place's snapNear), as `add` adds one. */
  addAll(net: WalkNetwork, snaps: Snaps, time: number, walked: number, tag: number): void {
    for (let i = 0; i < snaps.edge.length; i++) this.add(net, snaps, i, time, walked, tag);
  }
  /** Adds snap slot i of `snaps`, reached at `time` after `walked` metres of walking, as `tag`. */
  add(net: WalkNetwork, snaps: Snaps, i: number, time: number, walked: number, tag: number): void {
    const e = snaps.edge[i];
    if (e < 0) return;
    const len = net.edgeMetres[e];
    const f = snaps.along[i];
    const off = snaps.metres[i];
    const da = off + f * len;
    const db = off + (1 - f) * len;
    this.push(net.edgeA[e], time + da * this.pace, walked + da, tag);
    this.push(net.edgeB[e], time + db * this.pace, walked + db, tag);
  }
  private push(node: number, time: number, walked: number, tag: number) {
    this.nodes.push(node);
    this.times.push(time);
    this.walked.push(walked);
    this.tags.push(tag);
  }
}

/**
 * The time at snap slot i from a walk's labels (Infinity if out of reach), with
 * the source it came from in `src[0]`. The walk from the last node to the point
 * counts towards `maxWalkMetres`; `pace` is seconds per metre.
 */
export function timeAt(
  net: WalkNetwork,
  labels: WalkLabels,
  snaps: Snaps,
  i: number,
  maxWalkMetres: number,
  pace: number,
  src?: Int32Array,
): number {
  const e = snaps.edge[i];
  if (e < 0) return Infinity;
  const len = net.edgeMetres[e];
  const f = snaps.along[i];
  const off = snaps.metres[i];
  const a = net.edgeA[e];
  const b = net.edgeB[e];
  const da = f * len + off;
  const db = (1 - f) * len + off;
  let best = Infinity;
  if (labels.walk[a] + da <= maxWalkMetres) {
    best = labels.time[a] + da * pace;
    if (src) src[0] = labels.source[a];
  }
  if (labels.walk[b] + db <= maxWalkMetres && labels.time[b] + db * pace < best) {
    best = labels.time[b] + db * pace;
    if (src) src[0] = labels.source[b];
  }
  return best;
}

/** Labels of a walk: time since the start in seconds (Infinity = not reached), metres walked, and the source tag. */
export interface WalkLabels {
  time: Float64Array;
  walk: Float32Array;
  source: Int32Array;
}

const labelCache = new WeakMap<WalkNetwork, WalkLabels>();

/** Label arrays reused between walks on the same network (the result of the previous walk is overwritten). */
export function sharedLabels(net: WalkNetwork): WalkLabels {
  let l = labelCache.get(net);
  if (!l) {
    l = {
      time: new Float64Array(net.nodeCount),
      walk: new Float32Array(net.nodeCount),
      source: new Int32Array(net.nodeCount),
    };
    labelCache.set(net, l);
  }
  return l;
}

interface WalkQueue {
  head: Int32Array;
  next: Int32Array;
  entry: Int32Array;
}
const queues = new WeakMap<WalkNetwork, WalkQueue>();

/**
 * The bucket queue's arrays, kept per network between walks (a walk allocates nothing):
 * `buckets` heads set to empty, room for `size` entries.
 */
function queueFor(net: WalkNetwork, buckets: number, size: number): WalkQueue {
  let q = queues.get(net);
  if (!q || q.head.length < buckets || q.next.length < size) {
    const old = q;
    q = {
      head: old && old.head.length >= buckets ? old.head : new Int32Array(buckets),
      next: old && old.next.length >= size ? old.next : new Int32Array(size),
      entry: old && old.entry.length >= size ? old.entry : new Int32Array(size),
    };
    queues.set(net, q);
  }
  q.head.fill(-1, 0, buckets);
  return q;
}

/**
 * Multi-source Dijkstra on the walking network. Source i starts at node
 * `nodes[i]` at time `times[i]` having walked `walked[i]` metres already; a node
 * keeps the earliest time over all sources, and the source it came from. Walking
 * takes `pace` seconds per metre; walks longer than `maxWalkMetres` (start
 * included) are not followed.
 */
export function walkFrom(
  net: WalkNetwork,
  nodes: ArrayLike<number>,
  times: ArrayLike<number>,
  walked: ArrayLike<number>,
  tags: ArrayLike<number>,
  maxWalkMetres: number,
  pace: number,
  labels?: WalkLabels,
): WalkLabels {
  const n = net.nodeCount;
  const out = labels ?? {
    time: new Float64Array(n),
    walk: new Float32Array(n),
    source: new Int32Array(n),
  };
  const { time, walk, source } = out;
  time.fill(Infinity);
  const { offset, target, metres } = net;
  // Dial's algorithm: a bucket per whole second, scanned in order. A node improved
  // within the bucket being scanned goes back into it, so the labels stay exact.
  // The latest time any source can still walk to.
  let maxEnd = 0;
  for (let i = 0; i < nodes.length; i++) {
    const t = times[i];
    if (nodes[i] < 0 || !(t < Infinity) || walked[i] > maxWalkMetres) continue;
    const end = t + (maxWalkMetres - walked[i]) * pace;
    if (end > maxEnd) maxEnd = end;
  }
  const bucketCount = Math.floor(maxEnd) + 2;
  // Every source is pushed at most once and every arc at most once (a node is expanded
  // once), so the queue never outgrows sources + arcs: no growth check per push.
  const q = queueFor(net, bucketCount, nodes.length + target.length);
  const head = q.head;
  const next = q.next;
  const entry = q.entry;
  let used = 0;
  for (let i = 0; i < nodes.length; i++) {
    const v = nodes[i];
    const t = times[i];
    if (v < 0 || !(t < time[v]) || walked[i] > maxWalkMetres) continue;
    time[v] = t;
    walk[v] = walked[i];
    source[v] = tags[i];
    const b = Math.floor(t);
    entry[used] = v;
    next[used] = head[b];
    head[b] = used++;
  }
  for (let b = 0; b < bucketCount; b++) {
    while (head[b] !== -1) {
      const e = head[b];
      head[b] = next[e];
      const v = entry[e];
      const t = time[v];
      // Stale entry: the node has since improved into an earlier bucket. (A node is
      // pushed only when its label drops, so no label is expanded twice.)
      if (Math.floor(t) !== b) continue;
      const w = walk[v];
      const src = source[v];
      for (let k = offset[v]; k < offset[v + 1]; k++) {
        const u = target[k];
        const nt = t + metres[k] * pace;
        if (nt < time[u]) {
          const nw = w + metres[k];
          if (nw > maxWalkMetres) continue;
          time[u] = nt;
          walk[u] = nw;
          source[u] = src;
          const nb = Math.floor(nt);
          entry[used] = u;
          next[used] = head[nb];
          head[nb] = used++;
        }
      }
    }
  }
  return out;
}

/**
 * Labels of a multi-source walk that keeps, per node, every (time, walk) pair no other
 * beats on both. With one label per node a stop reached earlier but farther away would
 * block a nearer one reached later: its walk hits the cap first, and the places behind
 * would get a detour (S041). Node v's earliest label is time/walk/source[v] (time
 * Infinity: not reached); the later ones, each with a shorter walk, are xtime/xwalk/
 * xsource[l] for l from more[v] along xnext (-1 ends). Most places need only the
 * earliest: the later ones count where its walk is too long.
 */
export interface WalkFront {
  time: Float64Array;
  walk: Float32Array;
  source: Int32Array;
  more: Int32Array;
  xnext: Int32Array;
  xtime: Float64Array;
  xwalk: Float32Array;
  xsource: Int32Array;
  /** Later labels in use (the x arrays may be longer). */
  extra: number;
}

/** A label is dropped when another is no later and walks at most this much further (metres). */
const SAME_WALK_M = 0.01;

interface FrontState {
  front: WalkFront;
  /** Bucket heads, entries' next, node, time, walk and source. */
  bucket: Int32Array;
  qnext: Int32Array;
  qnode: Int32Array;
  qtime: Float64Array;
  qwalk: Float32Array;
  qsrc: Int32Array;
  /** The last label pushed to each node (time Infinity: none this walk). */
  pendTime: Float64Array;
  pendWalk: Float32Array;
}

const fronts = new WeakMap<WalkNetwork, FrontState>();

function grown<T extends Int32Array | Float32Array | Float64Array>(a: T, n: number): T {
  const b = new (a.constructor as new (n: number) => T)(n);
  b.set(a);
  return b;
}

/**
 * walkFrom with a Pareto front of (time, walk) labels per node, so the cap holds exactly for
 * every source: a label is dropped only when another at its node is no later and walks no
 * further. Labels are settled in time order (Dial's buckets per second), so a later one
 * survives only with a shorter walk. A new label is checked against the node's earliest and
 * newest labels and the last one pushed there; that may keep a few labels another would
 * beat, but never drops one that counts. The arrays are kept per network and overwritten
 * by the next walk.
 */
export function walkFront(
  net: WalkNetwork,
  nodes: ArrayLike<number>,
  times: ArrayLike<number>,
  walked: ArrayLike<number>,
  tags: ArrayLike<number>,
  maxWalkMetres: number,
  pace: number,
): WalkFront {
  const n = net.nodeCount;
  let st = fronts.get(net);
  if (!st) {
    const size = 2 * n + 1024;
    st = {
      front: {
        time: new Float64Array(n),
        walk: new Float32Array(n),
        source: new Int32Array(n),
        more: new Int32Array(n),
        xnext: new Int32Array(size),
        xtime: new Float64Array(size),
        xwalk: new Float32Array(size),
        xsource: new Int32Array(size),
        extra: 0,
      },
      bucket: new Int32Array(0),
      qnext: new Int32Array(2 * size),
      qnode: new Int32Array(2 * size),
      qtime: new Float64Array(2 * size),
      qwalk: new Float32Array(2 * size),
      qsrc: new Int32Array(2 * size),
      pendTime: new Float64Array(n),
      pendWalk: new Float32Array(n),
    };
    fronts.set(net, st);
  }
  const out = st.front;
  const { time, walk, source, more } = out;
  time.fill(Infinity);
  more.fill(-1);
  const pendTime = st.pendTime;
  const pendWalk = st.pendWalk;
  pendTime.fill(Infinity);
  let xnext = out.xnext;
  let xtime = out.xtime;
  let xwalk = out.xwalk;
  let xsrc = out.xsource;
  let extra = 0;

  let maxEnd = 0;
  for (let i = 0; i < nodes.length; i++) {
    const t = times[i];
    if (nodes[i] < 0 || !(t < Infinity) || walked[i] > maxWalkMetres) continue;
    const end = t + (maxWalkMetres - walked[i]) * pace;
    if (end > maxEnd) maxEnd = end;
  }
  const bucketCount = Math.floor(maxEnd) + 2;
  if (st.bucket.length < bucketCount) st.bucket = new Int32Array(bucketCount);
  const head = st.bucket;
  head.fill(-1, 0, bucketCount);
  let qnext = st.qnext;
  let qnode = st.qnode;
  let qtime = st.qtime;
  let qwalk = st.qwalk;
  let qsrc = st.qsrc;
  if (qnext.length < nodes.length) {
    const size = nodes.length + qnext.length;
    qnext = st.qnext = grown(qnext, size);
    qnode = st.qnode = grown(qnode, size);
    qtime = st.qtime = grown(qtime, size);
    qwalk = st.qwalk = grown(qwalk, size);
    qsrc = st.qsrc = grown(qsrc, size);
  }
  let used = 0;
  for (let i = 0; i < nodes.length; i++) {
    const v = nodes[i];
    const t = times[i];
    const w = walked[i];
    if (v < 0 || !(t < Infinity) || w > maxWalkMetres) continue;
    if (pendTime[v] <= t && pendWalk[v] <= w + SAME_WALK_M) continue;
    pendTime[v] = t;
    pendWalk[v] = w;
    const bk = Math.floor(t);
    qnode[used] = v;
    qtime[used] = t;
    qwalk[used] = w;
    qsrc[used] = tags[i];
    qnext[used] = head[bk];
    head[bk] = used++;
  }
  const { offset, target, metres } = net;
  for (let b = 0; b < bucketCount; b++) {
    for (let e = head[b]; e !== -1; e = head[b]) {
      head[b] = qnext[e];
      const v = qnode[e];
      const t = qtime[e];
      const w = qwalk[e];
      const src = qsrc[e];
      const t0 = time[v];
      if (t0 === Infinity) {
        time[v] = t;
        walk[v] = w;
        source[v] = src;
      } else {
        if (t0 <= t && walk[v] <= w + SAME_WALK_M) continue;
        const x = more[v];
        if (x !== -1 && xtime[x] <= t && xwalk[x] <= w + SAME_WALK_M) continue;
        if (extra === xnext.length) {
          const size = 2 * extra;
          xnext = out.xnext = grown(xnext, size);
          xtime = out.xtime = grown(xtime, size);
          xwalk = out.xwalk = grown(xwalk, size);
          xsrc = out.xsource = grown(xsrc, size);
        }
        if (t < t0) {
          // Earlier within the same second: it becomes the earliest label. The one it
          // replaces stays as a later label unless the new one also walks no further.
          if (w > walk[v] + SAME_WALK_M) {
            xtime[extra] = t0;
            xwalk[extra] = walk[v];
            xsrc[extra] = source[v];
            xnext[extra] = x;
            more[v] = extra++;
          }
          time[v] = t;
          walk[v] = w;
          source[v] = src;
        } else {
          xtime[extra] = t;
          xwalk[extra] = w;
          xsrc[extra] = src;
          xnext[extra] = x;
          more[v] = extra++;
        }
      }
      const k0 = offset[v];
      const k1 = offset[v + 1];
      // Room for a push along every arc (entries are not reused).
      if (used + k1 - k0 > qnext.length) {
        const size = 2 * qnext.length;
        qnext = st.qnext = grown(qnext, size);
        qnode = st.qnode = grown(qnode, size);
        qtime = st.qtime = grown(qtime, size);
        qwalk = st.qwalk = grown(qwalk, size);
        qsrc = st.qsrc = grown(qsrc, size);
      }
      for (let k = k0; k < k1; k++) {
        const nw = w + metres[k];
        if (nw > maxWalkMetres) continue;
        const u = target[k];
        const nt = t + metres[k] * pace;
        // Beaten by the last label pushed to u (it is settled, or beaten by one that is),
        // or by u's newest settled label (the shortest walk so far).
        if (pendTime[u] <= nt && pendWalk[u] <= nw + SAME_WALK_M) continue;
        const xu = more[u];
        if (xu !== -1) {
          if (xtime[xu] <= nt && xwalk[xu] <= nw + SAME_WALK_M) continue;
        } else if (time[u] <= nt && walk[u] <= nw + SAME_WALK_M) continue;
        pendTime[u] = nt;
        pendWalk[u] = nw;
        const nb = Math.floor(nt);
        qnode[used] = u;
        qtime[used] = nt;
        qwalk[used] = nw;
        qsrc[used] = src;
        qnext[used] = head[nb];
        head[nb] = used++;
      }
    }
  }
  out.extra = extra;
  return out;
}

const cellSnaps = new WeakMap<WalkNetwork, Map<string, CellSnaps>>();

/** Edges scattered between pauses when snapping in steps (about a millisecond's work). */
const SNAP_STEP_EDGES = 2048;
/** Grid rows swept between pauses when snapping in steps. */
const SNAP_STEP_ROWS = 16;

/**
 * Snaps the centres of a grid (as heatGrid lays it out) to the network. Cached per
 * network and grid layout, since it takes a moment and the layout rarely changes.
 */
export function snapCells(
  net: WalkNetwork,
  bbox: [number, number, number, number],
  cols: number,
  rows: number,
): CellSnaps {
  return finish(snapCellsInSteps(net, bbox, cols, rows));
}

/**
 * snapCells in steps: the generator pauses every millisecond or so, so a worker can answer
 * other messages in between (it runs a few steps, then lets queued messages in). The
 * result is cached as snapCells caches it.
 */
export function* snapCellsInSteps(
  net: WalkNetwork,
  bbox: [number, number, number, number],
  cols: number,
  rows: number,
): Generator<void, CellSnaps> {
  const key = `${bbox.join(',')}/${cols}x${rows}`;
  let byLayout = cellSnaps.get(net);
  if (!byLayout) cellSnaps.set(net, (byLayout = new Map()));
  const cached = byLayout.get(key);
  if (cached) return cached;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLon = (maxLon - minLon) / cols;
  const dLat = (maxLat - minLat) / rows;
  const snap = makeSnaps(cols * rows);
  const { edge, along, metres } = snap;
  // Squared distances while scattering; square-rooted at the end.
  const dist = metres;
  // Cell centres in the network's metre frame: x = cx0 + c * cw, y = cy0 - r * ch.
  const cw = dLon * net.mPerLon;
  const ch = dLat * M_PER_DEG_LAT;
  const cx0 = (minLon + dLon / 2 - net.lon0) * net.mPerLon;
  const cy0 = (maxLat - dLat / 2 - net.lat0) * M_PER_DEG_LAT;
  // Scatter every edge onto the cells within `reach` metres of it; that settles most cells.
  const reach = 1.5 * Math.max(cw, ch);
  const { x, y, edgeA, edgeB } = net;
  const scatter = (from: number, to: number) => {
    for (let e = from; e < to; e++) {
      const ax = x[edgeA[e]];
      const ay = y[edgeA[e]];
      const vx = x[edgeB[e]] - ax;
      const vy = y[edgeB[e]] - ay;
      const len2 = vx * vx + vy * vy;
      const c0 = Math.max(0, Math.ceil((Math.min(ax, ax + vx) - reach - cx0) / cw));
      const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, ax + vx) + reach - cx0) / cw));
      const r0 = Math.max(0, Math.ceil((cy0 - Math.max(ay, ay + vy) - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((cy0 - Math.min(ay, ay + vy) + reach) / ch));
      for (let r = r0; r <= r1; r++) {
        const py = cy0 - r * ch;
        for (let c = c0; c <= c1; c++) {
          const px = cx0 + c * cw;
          let f = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
          f = f < 0 ? 0 : f > 1 ? 1 : f;
          const dx = ax + f * vx - px;
          const dy = ay + f * vy - py;
          const d2 = dx * dx + dy * dy;
          const k = r * cols + c;
          if (d2 < dist[k]) {
            dist[k] = d2;
            edge[k] = e;
            along[k] = f;
          }
        }
      }
    }
  };
  yield* inPieces(net.edgeCount, scatter, SNAP_STEP_EDGES);
  // Cells further than `reach` from every edge (lakes, fields, rail yards): take the
  // best edge of a neighbouring cell, sweeping down and then up the grid. That is a
  // close approximation of the nearest edge there, and far cheaper than a search.
  const exact = reach * reach;
  let segF = 0;
  const segDist2 = (e: number, px: number, py: number) => {
    const ax = x[edgeA[e]];
    const ay = y[edgeA[e]];
    const vx = x[edgeB[e]] - ax;
    const vy = y[edgeB[e]] - ay;
    const len2 = vx * vx + vy * vy;
    let f = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    segF = f;
    const dx = ax + f * vx - px;
    const dy = ay + f * vy - py;
    return dx * dx + dy * dy;
  };
  const tryFrom = (k: number, nb: number, px: number, py: number) => {
    const e = edge[nb];
    if (e < 0 || e === edge[k]) return;
    const d2 = segDist2(e, px, py);
    if (d2 < dist[k]) {
      dist[k] = d2;
      edge[k] = e;
      along[k] = segF;
    }
  };
  const down = (r: number) => {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (dist[k] <= exact) continue;
      const px = cx0 + c * cw;
      const py = cy0 - r * ch;
      if (c > 0) tryFrom(k, k - 1, px, py);
      if (r > 0) {
        tryFrom(k, k - cols, px, py);
        if (c > 0) tryFrom(k, k - cols - 1, px, py);
        if (c < cols - 1) tryFrom(k, k - cols + 1, px, py);
      }
    }
  };
  const up = (r: number) => {
    for (let c = cols - 1; c >= 0; c--) {
      const k = r * cols + c;
      if (dist[k] <= exact) continue;
      const px = cx0 + c * cw;
      const py = cy0 - r * ch;
      if (c < cols - 1) tryFrom(k, k + 1, px, py);
      if (r < rows - 1) {
        tryFrom(k, k + cols, px, py);
        if (c > 0) tryFrom(k, k + cols - 1, px, py);
        if (c < cols - 1) tryFrom(k, k + cols + 1, px, py);
      }
    }
  };
  yield* inPieces(
    rows,
    (from, to) => {
      for (let r = from; r < to; r++) down(r);
    },
    SNAP_STEP_ROWS,
  );
  yield* inPieces(
    rows,
    (from, to) => {
      for (let i = from; i < to; i++) up(rows - 1 - i);
    },
    SNAP_STEP_ROWS,
  );
  const maxD2 = MAX_CELL_SNAP_M * MAX_CELL_SNAP_M;
  yield* inPieces(cols * rows, (from, to) => {
    for (let k = from; k < to; k++) {
      if (dist[k] <= maxD2) metres[k] = Math.sqrt(dist[k]);
      else {
        edge[k] = -1;
        metres[k] = Infinity;
      }
    }
  });
  // Only the cell ends are kept: along and metres follow from them.
  const ends = yield* cellEnds(net, snap);
  byLayout.set(key, ends);
  return ends;
}

/**
 * The walk from one point to another along the network, as [lon, lat] coordinates
 * from `from` to `to`, or null when either point is off the network or no path is
 * found within reach. For drawing a single trip: an A* search with predecessors
 * that only explores around the two points, so it costs a few milliseconds per walk.
 */
export function walkPath(
  net: WalkNetwork,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  maxSnapM: number = MAX_CELL_SNAP_M,
): [number, number][] | null {
  // Both places enter the network at each of their nearby edges (snapNear), the way onto
  // the edge counted, as the map's walks count it.
  const s0 = snapNear(net, from.lat, from.lon, maxSnapM);
  const s1 = snapNear(net, to.lat, to.lon, maxSnapM);
  if (s0.edge[0] < 0 || s1.edge[0] < 0) return null;
  const { x, y, edgeA, edgeB, edgeMetres, offset, target, metres } = net;
  const onEdge = (e: number, f: number): [number, number] => {
    const a = edgeA[e];
    const b = edgeB[e];
    const [lonA, latA] = nodeLonLat(net, a);
    const [lonB, latB] = nodeLonLat(net, b);
    return [lonA + f * (lonB - lonA), latA + f * (latB - latA)];
  };
  const start: [number, number] = [from.lon, from.lat];
  const end: [number, number] = [to.lon, to.lat];
  const slots = (sn: Snaps) => [...sn.edge.keys()].filter((i) => sn.edge[i] >= 0);
  // The shortest walk along a shared edge, if the two share one.
  let sameBest = Infinity;
  let same: [number, number] | null = null;
  for (const i of slots(s0))
    for (const j of slots(s1)) {
      const m = sameEdgeMetres(net, s0, i, s1, j);
      if (m < sameBest) [sameBest, same] = [m, [i, j]];
    }

  // Goal: either end of each target edge, plus the rest of that edge and the way off it.
  const goalCost = new Map<number, { cost: number; slot: number }>();
  const goal = (v: number, cost: number, slot: number) => {
    if (cost < (goalCost.get(v)?.cost ?? Infinity)) goalCost.set(v, { cost, slot });
  };
  for (const j of slots(s1)) {
    const e = s1.edge[j];
    const f = s1.along[j];
    goal(edgeA[e], f * edgeMetres[e] + s1.metres[j], j);
    goal(edgeB[e], (1 - f) * edgeMetres[e] + s1.metres[j], j);
  }
  const gx = (to.lon - net.lon0) * net.mPerLon;
  const gy = (to.lat - net.lat0) * M_PER_DEG_LAT;
  // Each edge length is at least the straight distance between its ends, and the way off the
  // network at least the straight line to the place, so this never overestimates and the
  // path found is the shortest.
  const h = (v: number) => Math.hypot(x[v] - gx, y[v] - gy);
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const seedSlot = new Map<number, number>();
  const heap = new MinHeap();
  const seed = (v: number, d: number, slot: number) => {
    if (d < (dist.get(v) ?? Infinity)) {
      dist.set(v, d);
      prev.set(v, -1);
      seedSlot.set(v, slot);
      heap.push(d + h(v), v);
    }
  };
  for (const i of slots(s0)) {
    const e = s0.edge[i];
    const f = s0.along[i];
    seed(edgeA[e], f * edgeMetres[e] + s0.metres[i], i);
    seed(edgeB[e], (1 - f) * edgeMetres[e] + s0.metres[i], i);
  }
  // Give up beyond a generous detour, so a point across a river with no bridge nearby
  // cannot make the search sweep the whole city.
  const e0 = s0.edge[0];
  const limit = 3 * Math.hypot(x[edgeA[e0]] - gx, y[edgeA[e0]] - gy) + 2000;
  let best = sameBest;
  let bestNode = -1;
  while (heap.size) {
    const [key, v] = heap.pop();
    if (key >= best || key > limit) break;
    const d = dist.get(v)!;
    if (key - h(v) > d + 1e-6) continue; // stale entry
    const g = goalCost.get(v);
    if (g !== undefined && d + g.cost < best) {
      best = d + g.cost;
      bestNode = v;
    }
    for (let k = offset[v]; k < offset[v + 1]; k++) {
      const u = target[k];
      const nd = d + metres[k];
      if (nd < (dist.get(u) ?? Infinity)) {
        dist.set(u, nd);
        prev.set(u, v);
        heap.push(nd + h(u), u);
      }
    }
  }
  if (bestNode < 0) {
    if (!same) return null;
    const [i, j] = same;
    return [start, onEdge(s0.edge[i], s0.along[i]), onEdge(s1.edge[j], s1.along[j]), end];
  }
  const nodes: [number, number][] = [];
  let first = bestNode;
  for (let v = bestNode; v >= 0; v = prev.get(v)!) {
    nodes.push(nodeLonLat(net, v));
    first = v;
  }
  nodes.reverse();
  const i = seedSlot.get(first)!;
  const j = goalCost.get(bestNode)!.slot;
  return [start, onEdge(s0.edge[i], s0.along[i]), ...nodes, onEdge(s1.edge[j], s1.along[j]), end];
}

/** A binary min-heap of (key, value) pairs. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0], vals[0]];
    const key = keys.pop()!;
    const val = vals.pop()!;
    const n = keys.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}
