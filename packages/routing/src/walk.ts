import { M_PER_DEG_LAT, metresPerDegLon, WALK_SPEED_MPS } from './geo';
import type { PreparedTimetable } from './prepare';

/**
 * Contract 3: the walking network (`walk.bin`), built by timetable-build from
 * OpenStreetMap footpaths and streets. Little-endian:
 * u32 magic "BTHW", u8 version 1, then unsigned LEB128 varints: nodeCount,
 * edgeCount; per node the zig-zag delta of lon and lat in 1e-5 degrees from the
 * previous node; per node a, the number of edges (a, b) with b > a, then for each
 * such edge (b - a) and its length in whole metres.
 */
const MAGIC = 0x57485442;
const COORD_SCALE = 1e5;

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
const BUCKET_M = 50;

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
  readonly lat: Float64Array;
  readonly lon: Float64Array;
  /** Node position in metres from (lat0, lon0). */
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
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  let p = 0;
  const magic = (buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24)) >>> 0;
  if (magic !== MAGIC) throw new Error('Not a walking network file');
  if (buf[4] !== 1) throw new Error(`Unsupported walking network version ${buf[4]}`);
  p = 5;
  const uvar = (): number => {
    let v = 0;
    let mul = 1;
    for (;;) {
      const b = buf[p++];
      if (b === undefined) throw new Error('Walking network file is truncated');
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
  };
  const svar = (): number => {
    const u = uvar();
    return u % 2 ? -(u + 1) / 2 : u / 2;
  };

  const n = uvar();
  const m = uvar();
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  let px = 0;
  let py = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (let i = 0; i < n; i++) {
    px += svar();
    py += svar();
    lon[i] = px / COORD_SCALE;
    lat[i] = py / COORD_SCALE;
    if (lat[i] < minLat) minLat = lat[i];
    if (lat[i] > maxLat) maxLat = lat[i];
    if (lon[i] < minLon) minLon = lon[i];
    if (lon[i] > maxLon) maxLon = lon[i];
  }
  const ea = new Int32Array(m);
  const eb = new Int32Array(m);
  const em = new Float32Array(m);
  const degree = new Int32Array(n + 1);
  let e = 0;
  for (let a = 0; a < n; a++) {
    const k = uvar();
    for (let j = 0; j < k; j++) {
      const b = a + uvar();
      if (e >= m || b >= n) throw new Error('Walking network file is inconsistent');
      ea[e] = a;
      eb[e] = b;
      em[e] = uvar();
      degree[a + 1]++;
      degree[b + 1]++;
      e++;
    }
  }
  if (e !== m) throw new Error('Walking network file is inconsistent');

  const offset = degree;
  for (let v = 0; v < n; v++) offset[v + 1] += offset[v];
  const fill = offset.slice(0, n);
  const target = new Int32Array(2 * m);
  const metres = new Float32Array(2 * m);
  const edgeMetres = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const s = em[k];
    edgeMetres[k] = s;
    target[fill[ea[k]]] = eb[k];
    metres[fill[ea[k]]++] = s;
    target[fill[eb[k]]] = ea[k];
    metres[fill[eb[k]]++] = s;
  }

  const lat0 = n ? minLat : 0;
  const lon0 = n ? minLon : 0;
  const mPerLon = metresPerDegLon((minLat + maxLat) / 2 || 52.5);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = (lon[i] - lon0) * mPerLon;
    y[i] = (lat[i] - lat0) * M_PER_DEG_LAT;
  }
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
  for (let k = 0; k < m; k++) eachBucket(k, (b) => bucketOffset[b + 1]++);
  for (let b = 0; b < bucketCols * bucketRows; b++) bucketOffset[b + 1] += bucketOffset[b];
  const bfill = bucketOffset.slice(0, bucketCols * bucketRows);
  const bucketEdges = new Int32Array(bucketOffset[bucketCols * bucketRows]);
  for (let k = 0; k < m; k++) eachBucket(k, (b) => (bucketEdges[bfill[b]++] = k));

  return {
    nodeCount: n,
    lat,
    lon,
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

/** A one-slot snap of an origin. */
export function snapOrigin(net: WalkNetwork, origin: { lat: number; lon: number }): Snaps {
  const snap = makeSnaps(1);
  snapPoint(net, origin.lat, origin.lon, snap, 0);
  return snap;
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

const stopSnaps = new WeakMap<WalkNetwork, WeakMap<PreparedTimetable, Snaps>>();

/** Every stop snapped to the network, cached per network and timetable. */
export function snapStops(net: WalkNetwork, tt: PreparedTimetable): Snaps {
  let byTt = stopSnaps.get(net);
  if (!byTt) stopSnaps.set(net, (byTt = new WeakMap()));
  let snap = byTt.get(tt);
  if (snap) return snap;
  snap = makeSnaps(tt.stopCount);
  for (let s = 0; s < tt.stopCount; s++) snapPoint(net, tt.stopLat[s], tt.stopLon[s], snap, s);
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

const cellSnaps = new WeakMap<WalkNetwork, Map<string, Snaps>>();

/** Edges scattered between pauses when snapping in steps (a few tens of ms each). */
const SNAP_STEP_EDGES = 40_000;

/**
 * Snaps the centres of a grid (as heatGrid lays it out) to the network. Cached per
 * network and grid layout, since it takes a moment and the layout rarely changes.
 */
export function snapCells(
  net: WalkNetwork,
  bbox: [number, number, number, number],
  cols: number,
  rows: number,
): Snaps {
  const steps = snapCellsInSteps(net, bbox, cols, rows);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/**
 * snapCells in steps: the generator pauses every few tens of milliseconds, so a worker
 * can answer other messages in between (await a timeout after each `next()`). The result
 * is cached as snapCells caches it.
 */
export function* snapCellsInSteps(
  net: WalkNetwork,
  bbox: [number, number, number, number],
  cols: number,
  rows: number,
): Generator<void, Snaps> {
  const key = `${bbox.join(',')}/${cols}x${rows}`;
  let byLayout = cellSnaps.get(net);
  if (!byLayout) cellSnaps.set(net, (byLayout = new Map()));
  let snap = byLayout.get(key);
  if (snap) return snap;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLon = (maxLon - minLon) / cols;
  const dLat = (maxLat - minLat) / rows;
  snap = makeSnaps(cols * rows);
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
  for (let e = 0; e < net.edgeCount; e++) {
    if (e % SNAP_STEP_EDGES === SNAP_STEP_EDGES - 1) yield;
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
  for (let r = 0; r < rows; r++) {
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
  }
  yield;
  for (let r = rows - 1; r >= 0; r--) {
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
  }
  const maxD2 = MAX_CELL_SNAP_M * MAX_CELL_SNAP_M;
  for (let k = 0; k < cols * rows; k++) {
    if (dist[k] <= maxD2) metres[k] = Math.sqrt(dist[k]);
    else {
      edge[k] = -1;
      metres[k] = Infinity;
    }
  }
  byLayout.set(key, snap);
  return snap;
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
  const snaps = makeSnaps(2);
  snapPoint(net, from.lat, from.lon, snaps, 0, maxSnapM);
  snapPoint(net, to.lat, to.lon, snaps, 1, maxSnapM);
  const e0 = snaps.edge[0];
  const e1 = snaps.edge[1];
  if (e0 < 0 || e1 < 0) return null;
  const { x, y, edgeA, edgeB, edgeMetres, offset, target, metres } = net;
  const onEdge = (e: number, f: number): [number, number] => {
    const a = edgeA[e];
    const b = edgeB[e];
    return [net.lon[a] + f * (net.lon[b] - net.lon[a]), net.lat[a] + f * (net.lat[b] - net.lat[a])];
  };
  const start: [number, number] = [from.lon, from.lat];
  const end: [number, number] = [to.lon, to.lat];
  const p0 = onEdge(e0, snaps.along[0]);
  const p1 = onEdge(e1, snaps.along[1]);
  if (e0 === e1) return [start, p0, p1, end];

  // Goal: either end of the target edge, plus the rest of that edge to the snapped point.
  const goalCost = new Map<number, number>([
    [edgeA[e1], snaps.along[1] * edgeMetres[e1]],
    [edgeB[e1], (1 - snaps.along[1]) * edgeMetres[e1]],
  ]);
  const gx = x[edgeA[e1]] + snaps.along[1] * (x[edgeB[e1]] - x[edgeA[e1]]);
  const gy = y[edgeA[e1]] + snaps.along[1] * (y[edgeB[e1]] - y[edgeA[e1]]);
  // Each edge length is at least the straight distance between its ends, so this
  // never overestimates and the path found is the shortest.
  const h = (v: number) => Math.hypot(x[v] - gx, y[v] - gy);
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  const seed = (v: number, d: number) => {
    if (d < (dist.get(v) ?? Infinity)) {
      dist.set(v, d);
      prev.set(v, -1);
      heap.push(d + h(v), v);
    }
  };
  seed(edgeA[e0], snaps.along[0] * edgeMetres[e0]);
  seed(edgeB[e0], (1 - snaps.along[0]) * edgeMetres[e0]);
  // Give up beyond a generous detour, so a point across a river with no bridge nearby
  // cannot make the search sweep the whole city.
  const limit = 3 * Math.hypot(x[edgeA[e0]] - gx, y[edgeA[e0]] - gy) + 2000;
  let best = Infinity;
  let bestNode = -1;
  while (heap.size) {
    const [key, v] = heap.pop();
    if (key >= best || key > limit) break;
    const d = dist.get(v)!;
    if (key - h(v) > d + 1e-6) continue; // stale entry
    const g = goalCost.get(v);
    if (g !== undefined && d + g < best) {
      best = d + g;
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
  if (bestNode < 0) return null;
  const nodes: [number, number][] = [];
  for (let v = bestNode; v >= 0; v = prev.get(v)!) nodes.push([net.lon[v], net.lat[v]]);
  nodes.reverse();
  return [start, p0, ...nodes, p1, end];
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
