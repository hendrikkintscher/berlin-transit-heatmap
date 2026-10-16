/**
 * `lines.bin`: the course of every stop-to-stop hop between two neighbouring stops, from
 * the feed's shapes (GTFS shapes.txt), so line overlays and trip lines follow the real
 * tracks and roads instead of running straight from stop to stop. Hops that are straight
 * anyway are left out. Little-endian:
 * u32 magic "BTHL", u8 version 1, then unsigned LEB128 varints (svar: zig-zag signed):
 * hop count; per hop svar stop a minus the previous hop's a, stop b minus a (b > a),
 * the number of inner points, then per inner point svar lon and lat in 1e-5 degrees
 * from the previous point (the first from stop a's position, which the app knows).
 * Points run from stop a to stop b; the stops themselves are not stored.
 *
 * This file imports nothing, so timetable-build can use the encoder directly.
 */

const MAGIC = 0x4c485442;
const SCALE = 1e5;

export interface Hop {
  /** Stop indices, a < b. */
  a: number;
  b: number;
  /** Inner points [lon, lat] from a towards b, without the two stops. */
  inner: [number, number][];
}

export function encodeLines(
  hops: Hop[],
  stopPos: (s: number) => [number, number],
): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  const uvar = (v: number) => {
    while (v > 127) {
      out.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    out.push(v);
  };
  const svar = (v: number) => uvar(v < 0 ? -2 * v - 1 : 2 * v);
  const sorted = [...hops].sort((x, y) => x.a - y.a || x.b - y.b);
  uvar(sorted.length);
  let prevA = 0;
  for (const h of sorted) {
    svar(h.a - prevA);
    prevA = h.a;
    uvar(h.b - h.a);
    uvar(h.inner.length);
    const start = stopPos(h.a);
    let x = Math.round(start[0] * SCALE);
    let y = Math.round(start[1] * SCALE);
    for (const [lon, lat] of h.inner) {
      const nx = Math.round(lon * SCALE);
      const ny = Math.round(lat * SCALE);
      svar(nx - x);
      svar(ny - y);
      x = nx;
      y = ny;
    }
  }
  const bytes = new Uint8Array(5 + out.length);
  new DataView(bytes.buffer).setUint32(0, MAGIC, true);
  bytes[4] = 1;
  bytes.set(out, 5);
  return bytes;
}

/** The hops of lines.bin, keyed a * stopCount + b, as flat [lon, lat, lon, lat, …] inner points. */
export interface LineShapes {
  stopCount: number;
  inner: Map<number, Float64Array>;
}

export function decodeLines(
  buffer: ArrayBuffer,
  stopCount: number,
  stopPos: (s: number) => [number, number],
): LineShapes {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 5 || new DataView(buffer).getUint32(0, true) !== MAGIC || bytes[4] !== 1)
    throw new Error('not a lines.bin file');
  let p = 5;
  const uvar = () => {
    let v = 0;
    let mul = 1;
    for (;;) {
      const b = bytes[p++];
      // Past the end b is undefined, and the loop would never stop.
      if (b === undefined) throw new Error('lines.bin is truncated');
      v += (b & 127) * mul;
      if (b < 128) return v;
      mul *= 128;
    }
  };
  const svar = () => {
    const v = uvar();
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  const inner = new Map<number, Float64Array>();
  const n = uvar();
  let a = 0;
  for (let i = 0; i < n; i++) {
    a += svar();
    const b = a + uvar();
    const k = uvar();
    const start = stopPos(a);
    let x = Math.round(start[0] * SCALE);
    let y = Math.round(start[1] * SCALE);
    const pts = new Float64Array(2 * k);
    for (let j = 0; j < k; j++) {
      x += svar();
      y += svar();
      pts[2 * j] = x / SCALE;
      pts[2 * j + 1] = y / SCALE;
    }
    if (a < stopCount && b < stopCount) inner.set(a * stopCount + b, pts);
  }
  if (p !== bytes.length) throw new Error('lines.bin is inconsistent');
  return { stopCount, inner };
}

/**
 * The course from stop `from` to stop `to` as [lon, lat] points, both stops included;
 * straight when the file has no course for the hop.
 */
export function hopCourse(
  shapes: LineShapes | null,
  from: number,
  to: number,
  stopPos: (s: number) => [number, number],
): [number, number][] {
  const out: [number, number][] = [stopPos(from)];
  const pts =
    shapes && from !== to
      ? shapes.inner.get(Math.min(from, to) * shapes.stopCount + Math.max(from, to))
      : undefined;
  if (pts) {
    const k = pts.length / 2;
    if (from < to) for (let j = 0; j < k; j++) out.push([pts[2 * j]!, pts[2 * j + 1]!]);
    else for (let j = k - 1; j >= 0; j--) out.push([pts[2 * j]!, pts[2 * j + 1]!]);
  }
  out.push(stopPos(to));
  return out;
}
