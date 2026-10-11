import { M_PER_DEG_LAT, metresPerDegLon } from './geo';
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

/** Walking speed on the footpath network, 4.8 km/h. */
export const NETWORK_WALK_SPEED_MPS = 4.8 / 3.6;
/** Points further than this from the network are not snapped to it. */
export const MAX_SNAP_M = 300;
const BUCKET_M = 50;

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
  /** Neighbours of node v: target[offset[v] .. offset[v+1]), with the walk in seconds. */
  readonly offset: Int32Array;
  readonly target: Int32Array;
  readonly seconds: Float32Array;
  /** The undirected edges, each once, with the walk along them in seconds. */
  readonly edgeCount: number;
  readonly edgeA: Int32Array;
  readonly edgeB: Int32Array;
  readonly edgeSeconds: Float32Array;
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
  const seconds = new Float32Array(2 * m);
  const edgeSeconds = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const s = em[k] / NETWORK_WALK_SPEED_MPS;
    edgeSeconds[k] = s;
    target[fill[ea[k]]] = eb[k];
    seconds[fill[ea[k]]++] = s;
    target[fill[eb[k]]] = ea[k];
    seconds[fill[eb[k]]++] = s;
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
    seconds,
    edgeCount: m,
    edgeA: ea,
    edgeB: eb,
    edgeSeconds,
    bucketCols,
    bucketRows,
    bucketOffset,
    bucketEdges,
  };
}

/** Where points meet the network: the nearest edge (-1 if none within MAX_SNAP_M),
 * how far along it from edgeA (0..1), and the walk from the point to it in seconds. */
export interface Snaps {
  edge: Int32Array;
  along: Float32Array;
  seconds: Float32Array;
}

function makeSnaps(n: number): Snaps {
  return {
    edge: new Int32Array(n).fill(-1),
    along: new Float32Array(n),
    seconds: new Float32Array(n).fill(Infinity),
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
  out.seconds[i] = best >= 0 ? Math.sqrt(bestD2) / NETWORK_WALK_SPEED_MPS : Infinity;
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
export function sameEdgeSeconds(
  net: WalkNetwork,
  a: Snaps,
  i: number,
  b: Snaps,
  j: number,
): number {
  const e = a.edge[i];
  if (e < 0 || e !== b.edge[j]) return Infinity;
  return Math.abs(a.along[i] - b.along[j]) * net.edgeSeconds[e] + a.seconds[i] + b.seconds[j];
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
  /** Adds snap slot i of `snaps`, reached at `time` after `walked` seconds of walking, as `tag`. */
  add(net: WalkNetwork, snaps: Snaps, i: number, time: number, walked: number, tag: number): void {
    const e = snaps.edge[i];
    if (e < 0) return;
    const len = net.edgeSeconds[e];
    const f = snaps.along[i];
    const off = snaps.seconds[i];
    this.push(net.edgeA[e], time + off + f * len, walked + off + f * len, tag);
    this.push(net.edgeB[e], time + off + (1 - f) * len, walked + off + (1 - f) * len, tag);
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
 * counts towards `maxWalkSeconds`.
 */
export function timeAt(
  net: WalkNetwork,
  labels: WalkLabels,
  snaps: Snaps,
  i: number,
  maxWalkSeconds: number,
  src?: Int32Array,
): number {
  const e = snaps.edge[i];
  if (e < 0) return Infinity;
  const len = net.edgeSeconds[e];
  const f = snaps.along[i];
  const off = snaps.seconds[i];
  const a = net.edgeA[e];
  const b = net.edgeB[e];
  const da = f * len + off;
  const db = (1 - f) * len + off;
  let best = Infinity;
  if (labels.walk[a] + da <= maxWalkSeconds) {
    best = labels.time[a] + da;
    if (src) src[0] = labels.source[a];
  }
  if (labels.walk[b] + db <= maxWalkSeconds && labels.time[b] + db < best) {
    best = labels.time[b] + db;
    if (src) src[0] = labels.source[b];
  }
  return best;
}

/** Labels of a walk: time since the start (Infinity = not reached), the walking part of it, and its source tag. */
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

/**
 * Multi-source Dijkstra on the walking network. Source i starts at node
 * `nodes[i]` at time `times[i]` having walked `walked[i]` seconds already; a node
 * keeps the earliest time over all sources, and the source it came from. Walks
 * longer than `maxWalkSeconds` (start included) are not followed.
 */
export function walkFrom(
  net: WalkNetwork,
  nodes: ArrayLike<number>,
  times: ArrayLike<number>,
  walked: ArrayLike<number>,
  tags: ArrayLike<number>,
  maxWalkSeconds: number,
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
  const { offset, target, seconds } = net;
  // Dial's algorithm: a bucket per whole second, scanned in order. A node improved
  // within the bucket being scanned goes back into it, so the labels stay exact.
  let maxStart = 0;
  for (let i = 0; i < nodes.length; i++) {
    const t = times[i];
    if (nodes[i] >= 0 && t < Infinity && walked[i] <= maxWalkSeconds && t > maxStart) maxStart = t;
  }
  const bucketCount = Math.floor(maxStart + maxWalkSeconds) + 2;
  const head = new Int32Array(bucketCount).fill(-1);
  let next = new Int32Array(Math.max(1024, n));
  let entry = new Int32Array(next.length);
  let used = 0;
  const push = (b: number, v: number) => {
    if (used === next.length) {
      const nn = new Int32Array(used * 2);
      nn.set(next);
      next = nn;
      const ne = new Int32Array(used * 2);
      ne.set(entry);
      entry = ne;
    }
    entry[used] = v;
    next[used] = head[b];
    head[b] = used++;
  };
  for (let i = 0; i < nodes.length; i++) {
    const v = nodes[i];
    const t = times[i];
    if (v < 0 || !(t < time[v]) || walked[i] > maxWalkSeconds) continue;
    time[v] = t;
    walk[v] = walked[i];
    source[v] = tags[i];
    push(Math.floor(t), v);
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
        const nt = t + seconds[k];
        if (nt < time[u]) {
          const nw = w + seconds[k];
          if (nw > maxWalkSeconds) continue;
          time[u] = nt;
          walk[u] = nw;
          source[u] = src;
          push(Math.floor(nt), u);
        }
      }
    }
  }
  return out;
}

const cellSnaps = new WeakMap<WalkNetwork, Map<string, Snaps>>();

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
  const key = `${bbox.join(',')}/${cols}x${rows}`;
  let byLayout = cellSnaps.get(net);
  if (!byLayout) cellSnaps.set(net, (byLayout = new Map()));
  let snap = byLayout.get(key);
  if (snap) return snap;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLon = (maxLon - minLon) / cols;
  const dLat = (maxLat - minLat) / rows;
  snap = makeSnaps(cols * rows);
  const { edge, along, seconds } = snap;
  // Squared distances in metres while scattering; turned into seconds at the end.
  const dist = seconds;
  // Cell centres in the network's metre frame: x = cx0 + c * cw, y = cy0 - r * ch.
  const cw = dLon * net.mPerLon;
  const ch = dLat * M_PER_DEG_LAT;
  const cx0 = (minLon + dLon / 2 - net.lon0) * net.mPerLon;
  const cy0 = (maxLat - dLat / 2 - net.lat0) * M_PER_DEG_LAT;
  // Scatter every edge onto the cells within `reach` metres of it; that settles most cells.
  const reach = 1.5 * Math.max(cw, ch);
  const { x, y, edgeA, edgeB } = net;
  for (let e = 0; e < net.edgeCount; e++) {
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
  const maxD2 = MAX_SNAP_M * MAX_SNAP_M;
  for (let k = 0; k < cols * rows; k++) {
    if (dist[k] <= maxD2) seconds[k] = Math.sqrt(dist[k]) / NETWORK_WALK_SPEED_MPS;
    else {
      edge[k] = -1;
      seconds[k] = Infinity;
    }
  }
  byLayout.set(key, snap);
  return snap;
}
