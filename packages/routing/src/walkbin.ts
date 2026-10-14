// walk.bin (Contract 3), the walking network: written by timetable-build, read by
// loadWalkNetwork (walk.ts). Little-endian u32 magic "BTHW", u8 version, then unsigned
// LEB128 varints (signed ones zig-zag encoded).
//
// Version 2, in columns, so each one compresses well on its own:
//   nodeCount, edgeCount, lonScale (millimetres per degree of longitude);
//   per node the delta of lon from the previous node, then per node the same for lat,
//   both in 1e-5 degrees (signed);
//   per node a, the number of edges (a, b) with b > a; then for each edge in that
//   order (b - a); then for each edge its length in whole metres minus the straight
//   line between its ends (signed, usually 0 or 1).
// The straight line uses only exact arithmetic on the stored integers (see straightM),
// so the build and every browser get the same metres.
//
// Version 1 (still read): nodeCount, edgeCount; per node the lon and lat deltas
// interleaved; per node a its edge count, then (b - a) and the metres for each edge.
// No imports: timetable-build runs this file with plain Node.

/** As geo.ts (kept here so the file has no imports). */
const M_PER_DEG_LAT = 111_320;

const MAGIC = 0x57485442;
const VERSION = 2;
const COORD_SCALE = 1e5;
/** Metres per 1e-5 degree of latitude. */
const Y_M = M_PER_DEG_LAT / COORD_SCALE;

/** The network as stored: node positions in degrees, undirected edges a < b sorted by a. */
export interface WalkData {
  lat: Float64Array;
  lon: Float64Array;
  edgeA: Int32Array;
  edgeB: Int32Array;
  /** Whole metres (at least 1). */
  edgeM: Float32Array;
}

/**
 * The straight line between two nodes in whole metres, from their integer positions
 * (1e-5 degrees). Products, a sum and a square root only: IEEE exact everywhere.
 */
function straightM(dx: number, dy: number, xM: number): number {
  const mx = dx * xM;
  const my = dy * Y_M;
  return Math.round(Math.sqrt(mx * mx + my * my));
}

/** Encodes a network (nodes in degrees, edges a < b sorted by a) as walk.bin version 2. */
export function encodeWalkBin(g: {
  lat: ArrayLike<number>;
  lon: ArrayLike<number>;
  edgeA: ArrayLike<number>;
  edgeB: ArrayLike<number>;
  edgeM: ArrayLike<number>;
}): Uint8Array {
  const n = g.lat.length;
  const m = g.edgeA.length;
  const x = new Int32Array(n);
  const y = new Int32Array(n);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    x[i] = Math.round(g.lon[i]! * COORD_SCALE);
    y[i] = Math.round(g.lat[i]! * COORD_SCALE);
    if (y[i]! < minY) minY = y[i]!;
    if (y[i]! > maxY) maxY = y[i]!;
  }
  const midLat = n ? (minY + maxY) / 2 / COORD_SCALE : 0;
  const lonScale = Math.round(M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180) * 1000);
  const xM = lonScale / 1e8;

  const out = new VarintWriter();
  out.u32(MAGIC);
  out.byte(VERSION);
  out.uvar(n);
  out.uvar(m);
  out.uvar(lonScale);
  for (const col of [x, y]) {
    let prev = 0;
    for (let i = 0; i < n; i++) {
      out.svar(col[i]! - prev);
      prev = col[i]!;
    }
  }
  let e = 0;
  for (let a = 0; a < n; a++) {
    let k = e;
    while (k < m && g.edgeA[k] === a) k++;
    out.uvar(k - e);
    e = k;
  }
  if (e !== m) throw new Error('Edges must be sorted by their first node');
  for (let k = 0; k < m; k++) out.uvar(g.edgeB[k]! - g.edgeA[k]!);
  for (let k = 0; k < m; k++) {
    const a = g.edgeA[k]!;
    const b = g.edgeB[k]!;
    const metres = Math.max(1, Math.round(g.edgeM[k]!));
    out.svar(metres - straightM(x[b]! - x[a]!, y[b]! - y[a]!, xM));
  }
  return out.finish();
}

/** Reads walk.bin, version 1 or 2. */
export function decodeWalkBin(buf: Uint8Array): WalkData {
  const steps = decodeWalkBinInSteps(buf);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/** Items handled between pauses by the *InSteps generators (about a millisecond's work). */
const STEP = 1 << 13;

/**
 * Runs `part(from, to)` over 0 … n in pieces of `step`, pausing after each: the loops stay
 * plain functions, as fast as without pauses, and the generator only goes between them.
 */
export function* inPieces(
  n: number,
  part: (from: number, to: number) => void,
  step = STEP,
): Generator<void, void> {
  for (let i = 0; i < n; i += step) {
    part(i, Math.min(n, i + step));
    yield;
  }
}

/**
 * decodeWalkBin in steps: the generator pauses every STEP nodes or edges, so a worker can
 * answer other messages in between.
 */
export function* decodeWalkBinInSteps(buf: Uint8Array): Generator<void, WalkData> {
  const magic = (buf[0]! | (buf[1]! << 8) | (buf[2]! << 16) | (buf[3]! << 24)) >>> 0;
  if (magic !== MAGIC) throw new Error('Not a walking network file');
  const version = buf[4];
  if (version !== 1 && version !== 2)
    throw new Error(`Unsupported walking network version ${version}`);
  let p = 5;
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
  const inconsistent = () => new Error('Walking network file is inconsistent');

  const n = uvar();
  const m = uvar();
  const xM = version === 2 ? uvar() / 1e8 : 0;
  const x = new Int32Array(n);
  const y = new Int32Array(n);
  if (version === 1) {
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      x[i] = px += svar();
      y[i] = py += svar();
    }
  } else {
    for (const col of [x, y]) {
      let prev = 0;
      yield* inPieces(n, (from, to) => {
        let v = prev;
        for (let i = from; i < to; i++) col[i] = v += svar();
        prev = v;
      });
    }
  }
  const edgeA = new Int32Array(m);
  const edgeB = new Int32Array(m);
  const edgeM = new Float32Array(m);
  let e = 0;
  if (version === 1) {
    for (let a = 0; a < n; a++) {
      const k = uvar();
      for (let j = 0; j < k; j++) {
        const b = a + uvar();
        if (e >= m || b >= n) throw inconsistent();
        edgeA[e] = a;
        edgeB[e] = b;
        edgeM[e] = uvar();
        e++;
      }
    }
  } else {
    yield* inPieces(n, (from, to) => {
      let f = e;
      for (let a = from; a < to; a++) {
        const k = uvar();
        if (f + k > m) throw inconsistent();
        edgeA.fill(a, f, f + k);
        f += k;
      }
      e = f;
    });
    yield* inPieces(e, (from, to) => {
      for (let k = from; k < to; k++) {
        const b = (edgeB[k] = edgeA[k]! + uvar());
        if (b >= n) throw inconsistent();
      }
    });
    yield* inPieces(e, (from, to) => {
      for (let k = from; k < to; k++) {
        const a = edgeA[k]!;
        const b = edgeB[k]!;
        edgeM[k] = straightM(x[b]! - x[a]!, y[b]! - y[a]!, xM) + svar();
      }
    });
  }
  if (e !== m) throw inconsistent();
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  yield* inPieces(n, (from, to) => {
    for (let i = from; i < to; i++) {
      lon[i] = x[i]! / COORD_SCALE;
      lat[i] = y[i]! / COORD_SCALE;
    }
  });
  return { lat, lon, edgeA, edgeB, edgeM };
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
