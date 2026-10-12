/**
 * The walking network: walkable OpenStreetMap ways turned into a compact graph
 * the browser router runs Dijkstra on (Contract 3, see packages/routing/src/walk.ts).
 *
 * Input is OPL text (`osmium cat -f opl`) of the ways kept by the OSM refresh
 * workflow. Chains of ways are cut into edges at junctions and at least every
 * NODE_SPACING_M metres, so every point on a path is close to a graph node, and
 * only the largest connected piece of the network is kept.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { REGION } from '../../routing/src/regions.ts';
import { inBBox, toBBox, type BBox } from './geo.ts';

/** Walking speed for transfers between stops, 4 km/h (the router's default walking speed). */
export const NETWORK_WALK_SPEED_MPS = 4 / 3.6;
/** Graph nodes are kept at least this often along a path. */
export const NODE_SPACING_M = 100;
/** Dead ends shorter than this are left out. */
const SHORT_DEAD_END_M = 30;
/** Coordinates are stored in units of 1e-5 degrees (about 1 m). */
const COORD_SCALE = 1e5;
const MAGIC = 0x57485442; // "BTHW" little-endian
const VERSION = 1;

const M_PER_DEG_LAT = 111_320;

export interface WalkGraph {
  /** Node positions in degrees. */
  lat: Float64Array;
  lon: Float64Array;
  /** Undirected edges a < b with their length in metres. */
  edgeA: Int32Array;
  edgeB: Int32Array;
  edgeM: Float64Array;
}

export interface WalkBuildStats {
  osmNodes: number;
  osmWays: number;
  keptWays: number;
  nodes: number;
  edges: number;
  /** Share of graph nodes in the kept (largest) component before pruning. */
  largestComponentShare: number;
  lengthKm: number;
}

const NOT_WALKABLE = new Set([
  'motorway',
  'motorway_link',
  'construction',
  'proposed',
  'planned',
  'abandoned',
  'razed',
  'disused',
  'raceway',
  'bus_guideway',
  'escape',
  'rest_area',
  'services',
  'emergency_bay',
  'no',
]);
const NO = new Set(['no', 'private']);
/** Left out to keep the graph small: driveways and parking aisles are dead ends. */
const REDUNDANT_SERVICE = new Set(['driveway', 'parking_aisle', 'drive-through']);
const YES = new Set(['yes', 'designated', 'permissive', 'destination']);

/** Whether a way with these OSM tags can be walked on. */
export function isWalkable(tags: Map<string, string>): boolean {
  const foot = tags.get('foot');
  if (foot !== undefined && NO.has(foot)) return false;
  const highway = tags.get('highway');
  if (highway === undefined) {
    return tags.get('railway') === 'platform' || tags.get('public_transport') === 'platform';
  }
  if (NOT_WALKABLE.has(highway)) return false;
  if (highway === 'service' && REDUNDANT_SERVICE.has(tags.get('service') ?? '')) return false;
  if (tags.get('motorroad') === 'yes' && !(foot && YES.has(foot))) return false;
  const access = tags.get('access');
  if (access !== undefined && NO.has(access) && !(foot && YES.has(foot))) return false;
  return true;
}

/** Decodes OPL's %xx% escapes. */
function unescapeOpl(s: string): string {
  if (!s.includes('%')) return s;
  return s.replace(/%([0-9a-fA-F]+)%/g, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
}

function parseTags(field: string): Map<string, string> {
  const tags = new Map<string, string>();
  if (field.length <= 1) return tags;
  for (const kv of field.slice(1).split(',')) {
    const eq = kv.indexOf('=');
    if (eq > 0) tags.set(unescapeOpl(kv.slice(0, eq)), unescapeOpl(kv.slice(eq + 1)));
  }
  return tags;
}

/** Reads OPL lines (plain or gzipped file) into the walking graph. */
export async function readOplFile(
  path: string,
  bbox?: BBox,
): Promise<{ graph: WalkGraph; stats: WalkBuildStats }> {
  let input: NodeJS.ReadableStream = createReadStream(path);
  if (path.endsWith('.gz')) input = input.pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  return buildWalkGraph(lines, bbox);
}

/** The router's grid area plus a margin of more than a 15-minute walk, from the region. */
export const WALK_BBOX: BBox = toBBox(REGION.walkBbox);

/** Builds the walking graph from OPL lines (nodes before ways, as osmium writes them). */
export async function buildWalkGraph(
  lines: AsyncIterable<string> | Iterable<string>,
  bbox: BBox = WALK_BBOX,
): Promise<{ graph: WalkGraph; stats: WalkBuildStats }> {
  const index = new Map<number, number>();
  const lat: number[] = [];
  const lon: number[] = [];
  const ways: number[][] = [];
  let osmWays = 0;
  let keptWays = 0;
  for await (const line of lines) {
    if (line.charCodeAt(0) === 110 /* n */) {
      const parts = line.split(' ');
      let x = NaN;
      let y = NaN;
      for (const p of parts) {
        if (p[0] === 'x') x = Number(p.slice(1));
        else if (p[0] === 'y') y = Number(p.slice(1));
      }
      if (!Number.isFinite(x) || !Number.isFinite(y) || !inBBox(bbox, y, x)) continue;
      index.set(Number(parts[0]!.slice(1)), lat.length);
      lat.push(y);
      lon.push(x);
    } else if (line.charCodeAt(0) === 119 /* w */) {
      osmWays++;
      const parts = line.split(' ');
      const tagField = parts.find((p) => p[0] === 'T');
      const nodeField = parts.find((p) => p[0] === 'N');
      if (!nodeField || nodeField.length < 2) continue;
      if (!isWalkable(parseTags(tagField ?? 'T'))) continue;
      keptWays++;
      let refs: number[] = [];
      for (const r of nodeField.slice(1).split(',')) {
        const i = index.get(Number(r.slice(1)));
        if (i !== undefined) {
          refs.push(i);
          continue;
        }
        // A node outside the area cuts the way.
        if (refs.length >= 2) ways.push(refs);
        refs = [];
      }
      if (refs.length >= 2) ways.push(refs);
    }
  }
  return simplify(lat, lon, ways, { osmWays, keptWays });
}

function simplify(
  lat: number[],
  lon: number[],
  ways: number[][],
  counts: { osmWays: number; keptWays: number },
): { graph: WalkGraph; stats: WalkBuildStats } {
  const n = lat.length;
  const mPerLon = M_PER_DEG_LAT * Math.cos((52.5 * Math.PI) / 180);
  const dist = (a: number, b: number) => {
    const dx = (lon[b]! - lon[a]!) * mPerLon;
    const dy = (lat[b]! - lat[a]!) * M_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // The OSM segments as an undirected graph without duplicates (CSR).
  const keys: number[] = [];
  for (const w of ways)
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1]!;
      const b = w[i]!;
      if (a !== b) keys.push(a * n + b, b * n + a);
    }
  const sorted = Float64Array.from(keys).sort();
  const offset = new Int32Array(n + 1);
  const target: number[] = [];
  for (let k = 0; k < sorted.length; k++) {
    if (k > 0 && sorted[k] === sorted[k - 1]) continue;
    const a = Math.floor(sorted[k]! / n);
    offset[a + 1]!++;
    target.push(sorted[k]! - a * n);
  }
  for (let a = 0; a < n; a++) offset[a + 1]! += offset[a]!;

  // Graph nodes: junctions and dead ends (anything but degree 2), plus a node at
  // least every NODE_SPACING_M along the chains between them.
  const graphId = new Int32Array(n).fill(-1);
  const gLat: number[] = [];
  const gLon: number[] = [];
  const keep = (v: number) => {
    if (graphId[v] === -1) {
      graphId[v] = gLat.length;
      gLat.push(lat[v]!);
      gLon.push(lon[v]!);
    }
    return graphId[v]!;
  };
  const degree = (v: number) => offset[v + 1]! - offset[v]!;
  const edges = new Map<string, number>();
  const addEdge = (a: number, b: number, m: number) => {
    if (a === b) return;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const old = edges.get(key);
    if (old === undefined || m < old) edges.set(key, m);
  };
  const visited = new Uint8Array(n);
  /** Follows the chain from kept node u through neighbour v to the next junction. */
  const follow = (u: number, v: number) => {
    let from = keep(u);
    let prev = u;
    let cur = v;
    let run = dist(u, v);
    while (degree(cur) === 2 && graphId[cur] === -1) {
      if (visited[cur]) return;
      visited[cur] = 1;
      const o = offset[cur]!;
      const next = target[o] === prev ? target[o + 1]! : target[o]!;
      if (run >= NODE_SPACING_M) {
        const id = keep(cur);
        addEdge(from, id, run);
        from = id;
        run = 0;
      }
      run += dist(cur, next);
      prev = cur;
      cur = next;
    }
    addEdge(from, keep(cur), run);
  };
  for (let u = 0; u < n; u++) {
    if (degree(u) === 0 || degree(u) === 2) continue;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) follow(u, target[k]!);
  }
  // Rings with no junction at all: start anywhere on them.
  for (let u = 0; u < n; u++) {
    if (degree(u) !== 2 || visited[u] || graphId[u] !== -1) continue;
    visited[u] = 1;
    keep(u);
    for (let k = offset[u]!; k < offset[u + 1]!; k++) follow(u, target[k]!);
  }

  thin(edges);

  // Keep the largest connected component.
  const N = gLat.length;
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const pairs: [number, number, number][] = [];
  for (const [key, m] of edges) {
    const [a, b] = key.split(',').map(Number) as [number, number];
    pairs.push([a, b, m]);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const size = new Int32Array(N);
  for (let i = 0; i < N; i++) size[find(i)]!++;
  let root = 0;
  for (let i = 0; i < N; i++) if (size[i]! > size[root]!) root = i;

  // Renumber the kept nodes along a Z-order curve, so neighbours get nearby indices.
  const keptNodes: number[] = [];
  for (let i = 0; i < N; i++) if (find(i) === root) keptNodes.push(i);
  let minLat = Infinity;
  let minLon = Infinity;
  for (const i of keptNodes) {
    minLat = Math.min(minLat, gLat[i]!);
    minLon = Math.min(minLon, gLon[i]!);
  }
  const z = new Map<number, number>();
  for (const i of keptNodes) {
    const x = Math.floor(((gLon[i]! - minLon) * mPerLon) / 10);
    const y = Math.floor(((gLat[i]! - minLat) * M_PER_DEG_LAT) / 10);
    z.set(i, morton(x, y));
  }
  keptNodes.sort((a, b) => z.get(a)! - z.get(b)!);
  const newId = new Int32Array(N).fill(-1);
  keptNodes.forEach((old, k) => (newId[old] = k));

  const outLat = new Float64Array(keptNodes.length);
  const outLon = new Float64Array(keptNodes.length);
  keptNodes.forEach((old, k) => {
    outLat[k] = gLat[old]!;
    outLon[k] = gLon[old]!;
  });
  const kept = pairs
    .filter(([a]) => newId[a]! >= 0)
    .map(([a, b, m]) => {
      const x = newId[a]!;
      const y = newId[b]!;
      return x < y ? ([x, y, m] as const) : ([y, x, m] as const);
    })
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const graph: WalkGraph = {
    lat: outLat,
    lon: outLon,
    edgeA: Int32Array.from(kept, (e) => e[0]),
    edgeB: Int32Array.from(kept, (e) => e[1]),
    edgeM: Float64Array.from(kept, (e) => e[2]),
  };
  return {
    graph,
    stats: {
      osmNodes: n,
      ...counts,
      nodes: keptNodes.length,
      edges: kept.length,
      largestComponentShare: N ? keptNodes.length / N : 0,
      lengthKm: kept.reduce((s, e) => s + e[2], 0) / 1000,
    },
  };
}

/**
 * Drops short dead ends (kerb stubs, the last metres of a footway) and then nodes
 * with two neighbours whose edges together stay within NODE_SPACING_M. Neither
 * changes any walking distance between the remaining nodes.
 */
function thin(edges: Map<string, number>): void {
  const adj = new Map<number, Map<number, number>>();
  const link = (a: number, b: number, m: number) => {
    let x = adj.get(a);
    if (!x) adj.set(a, (x = new Map()));
    const old = x.get(b);
    if (old === undefined || m < old) x.set(b, m);
  };
  for (const [key, m] of edges) {
    const [a, b] = key.split(',').map(Number) as [number, number];
    link(a, b, m);
    link(b, a, m);
  }
  const unlink = (a: number, b: number) => {
    adj.get(a)?.delete(b);
    adj.get(b)?.delete(a);
  };
  for (let pass = 0; pass < 3; pass++) {
    for (const [v, nb] of adj) {
      if (nb.size !== 1) continue;
      const [u, m] = nb.entries().next().value!;
      if (m < SHORT_DEAD_END_M && adj.get(u)!.size > 1) unlink(v, u);
    }
  }
  for (const [v, nb] of adj) {
    if (nb.size !== 2) continue;
    const [[x, mx], [y, my]] = [...nb] as [[number, number], [number, number]];
    if (mx + my > NODE_SPACING_M) continue;
    unlink(v, x);
    unlink(v, y);
    link(x, y, mx + my);
    link(y, x, mx + my);
  }
  edges.clear();
  for (const [a, nb] of adj) for (const [b, m] of nb) if (a < b) edges.set(`${a},${b}`, m);
}

/** Interleaves the bits of two non-negative integers below 2^16. */
function morton(x: number, y: number): number {
  let z = 0;
  for (let b = 0; b < 16; b++) {
    z += ((x >> b) & 1) * 2 ** (2 * b) + ((y >> b) & 1) * 2 ** (2 * b + 1);
  }
  return z;
}

/**
 * Encodes the graph as `walk.bin` (Contract 3):
 * u32 magic "BTHW", u8 version, then unsigned LEB128 varints:
 * nodeCount, edgeCount; per node the zig-zag delta of lon and lat in 1e-5 degrees
 * from the previous node; per node a, the number of edges (a, b) with b > a,
 * then for each such edge (b - a) and its length in whole metres (at least 1).
 */
export function encodeWalkGraph(g: WalkGraph): Uint8Array {
  const out = new VarintWriter();
  out.u32(MAGIC);
  out.byte(VERSION);
  const n = g.lat.length;
  out.uvar(n);
  out.uvar(g.edgeA.length);
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.round(g.lon[i]! * COORD_SCALE);
    const y = Math.round(g.lat[i]! * COORD_SCALE);
    out.svar(x - px);
    out.svar(y - py);
    px = x;
    py = y;
  }
  let e = 0;
  for (let a = 0; a < n; a++) {
    let k = e;
    while (k < g.edgeA.length && g.edgeA[k] === a) k++;
    out.uvar(k - e);
    for (; e < k; e++) {
      out.uvar(g.edgeB[e]! - a);
      out.uvar(Math.max(1, Math.round(g.edgeM[e]!)));
    }
  }
  return out.finish();
}

class VarintWriter {
  private buf = new Uint8Array(1 << 20);
  private len = 0;
  private ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + extra));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  byte(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v;
  }
  u32(v: number) {
    for (let i = 0; i < 4; i++) this.byte((v >>> (8 * i)) & 0xff);
  }
  uvar(v: number) {
    this.ensure(10);
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.len++] = v;
  }
  svar(v: number) {
    this.uvar(v < 0 ? -2 * v - 1 : 2 * v);
  }
  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** A point attached to the walking graph: edge index, position along it from edgeA (0..1), metres off it. */
interface GraphSnap {
  edge: number;
  along: number;
  offM: number;
}

/**
 * Walking distances on the graph between points, for transfers. Points are
 * attached to their nearest edge (within maxSnapM); distances are found with a
 * Dijkstra bounded to a radius.
 */
export class WalkDistances {
  private readonly g: WalkGraph;
  private readonly x: Float64Array;
  private readonly y: Float64Array;
  private readonly offset: Int32Array;
  private readonly target: Int32Array;
  private readonly metres: Float64Array;
  private readonly buckets = new Map<string, number[]>();
  private static readonly BUCKET_M = 100;

  constructor(g: WalkGraph) {
    this.g = g;
    const n = g.lat.length;
    const mPerLon = M_PER_DEG_LAT * Math.cos((52.5 * Math.PI) / 180);
    this.x = Float64Array.from(g.lon, (v) => v * mPerLon);
    this.y = Float64Array.from(g.lat, (v) => v * M_PER_DEG_LAT);
    const deg = new Int32Array(n + 1);
    for (let e = 0; e < g.edgeA.length; e++) {
      deg[g.edgeA[e]! + 1]!++;
      deg[g.edgeB[e]! + 1]!++;
    }
    for (let v = 0; v < n; v++) deg[v + 1]! += deg[v]!;
    this.offset = deg;
    this.target = new Int32Array(2 * g.edgeA.length);
    this.metres = new Float64Array(2 * g.edgeA.length);
    const fill = deg.slice(0, n);
    for (let e = 0; e < g.edgeA.length; e++) {
      const a = g.edgeA[e]!;
      const b = g.edgeB[e]!;
      this.target[fill[a]!] = b;
      this.metres[fill[a]!++] = g.edgeM[e]!;
      this.target[fill[b]!] = a;
      this.metres[fill[b]!++] = g.edgeM[e]!;
    }
    const B = WalkDistances.BUCKET_M;
    for (let e = 0; e < g.edgeA.length; e++) {
      const a = g.edgeA[e]!;
      const b = g.edgeB[e]!;
      for (
        let r = Math.floor(Math.min(this.y[a]!, this.y[b]!) / B);
        r <= Math.floor(Math.max(this.y[a]!, this.y[b]!) / B);
        r++
      )
        for (
          let c = Math.floor(Math.min(this.x[a]!, this.x[b]!) / B);
          c <= Math.floor(Math.max(this.x[a]!, this.x[b]!) / B);
          c++
        ) {
          const key = `${c},${r}`;
          const list = this.buckets.get(key);
          if (list) list.push(e);
          else this.buckets.set(key, [e]);
        }
    }
  }

  snap(lat: number, lon: number, maxSnapM: number): GraphSnap | null {
    const mPerLon = M_PER_DEG_LAT * Math.cos((52.5 * Math.PI) / 180);
    const px = lon * mPerLon;
    const py = lat * M_PER_DEG_LAT;
    const B = WalkDistances.BUCKET_M;
    const reach = Math.ceil(maxSnapM / B);
    const bc = Math.floor(px / B);
    const br = Math.floor(py / B);
    let best: GraphSnap | null = null;
    for (let r = br - reach; r <= br + reach; r++)
      for (let c = bc - reach; c <= bc + reach; c++)
        for (const e of this.buckets.get(`${c},${r}`) ?? []) {
          const a = this.g.edgeA[e]!;
          const b = this.g.edgeB[e]!;
          const ax = this.x[a]!;
          const ay = this.y[a]!;
          const vx = this.x[b]! - ax;
          const vy = this.y[b]! - ay;
          const len2 = vx * vx + vy * vy;
          const f =
            len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
          const d = Math.hypot(ax + f * vx - px, ay + f * vy - py);
          if (d <= maxSnapM && (!best || d < best.offM)) best = { edge: e, along: f, offM: d };
        }
    return best;
  }

  /** Walking metres from `from` to each of `to` (Infinity beyond `maxM`). */
  distances(from: GraphSnap, to: (GraphSnap | null)[], maxM: number): number[] {
    const g = this.g;
    const dist = new Map<number, number>();
    const heap: [number, number][] = [];
    const push = (v: number, d: number) => {
      if (d > maxM || d >= (dist.get(v) ?? Infinity)) return;
      dist.set(v, d);
      heap.push([d, v]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= heap.length) break;
          if (c + 1 < heap.length && heap[c + 1]![0] < heap[c]![0]) c++;
          if (heap[c]![0] >= heap[i]![0]) break;
          [heap[c], heap[i]] = [heap[i]!, heap[c]!];
          i = c;
        }
      }
      return top;
    };
    const len = g.edgeM[from.edge]!;
    push(g.edgeA[from.edge]!, from.offM + from.along * len);
    push(g.edgeB[from.edge]!, from.offM + (1 - from.along) * len);
    while (heap.length) {
      const [d, v] = pop();
      if (d > dist.get(v)!) continue;
      for (let k = this.offset[v]!; k < this.offset[v + 1]!; k++)
        push(this.target[k]!, d + this.metres[k]!);
    }
    return to.map((t) => {
      if (!t) return Infinity;
      const l = g.edgeM[t.edge]!;
      let d = Math.min(
        (dist.get(g.edgeA[t.edge]!) ?? Infinity) + t.along * l,
        (dist.get(g.edgeB[t.edge]!) ?? Infinity) + (1 - t.along) * l,
      );
      if (t.edge === from.edge) d = Math.min(d, from.offM + Math.abs(t.along - from.along) * l);
      d += t.offM;
      return d <= maxM ? d : Infinity;
    });
  }
}
