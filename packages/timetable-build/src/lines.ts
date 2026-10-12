// The course of each stop-to-stop hop along the real tracks and roads, from the feed's
// shapes (shapes.txt), for lines.bin (routing linesbin.ts). Each trip pattern's stops are
// placed on its shape in order; the shape between two neighbouring stops, simplified to a
// few metres, becomes that hop's course. Hops whose course would be straight anyway, or
// where the shape does not fit the stops, are left out (the app draws them straight).
import type { Hop } from '../../routing/src/linesbin.ts';

/** Points closer than this to the simplified line are dropped. */
const SIMPLIFY_M = 4;
/** Shape points this close to a stop are dropped (platforms lie beside the track). */
const NEAR_STOP_M = 20;
/** A stop further than this from its shape: the shape does not fit, no course. */
const MAX_OFF_M = 150;
/** A course longer than this many times the straight line (plus slack): something is off. */
const MAX_DETOUR = 3;

/** A shape as flat [lon, lat, lon, lat, …] in point order. */
export type Shape = Float64Array;

export interface Pattern {
  shape: string;
  /** Stop indices (the output's, shared by all windows) in travel order. */
  stops: number[];
}

/** Local metres around a latitude: x east, y north. */
function projector(lat0: number) {
  const ky = 111_320;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    x: (lon: number) => lon * kx,
    y: (lat: number) => lat * ky,
  };
}

/** Douglas-Peucker on [lon, lat] points with a tolerance in metres. */
export function simplify(points: [number, number][], tolM: number): [number, number][] {
  if (points.length <= 2) return points;
  const pr = projector(points[0]![1]);
  const xs = points.map((p) => pr.x(p[0]));
  const ys = points.map((p) => pr.y(p[1]));
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const dx = xs[j]! - xs[i]!;
    const dy = ys[j]! - ys[i]!;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = tolM;
    for (let k = i + 1; k < j; k++) {
      let t = len2 ? ((xs[k]! - xs[i]!) * dx + (ys[k]! - ys[i]!) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(xs[i]! + t * dx - xs[k]!, ys[i]! + t * dy - ys[k]!);
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

/**
 * Places the stops on the shape in travel order: per stop the nearest point on the
 * shape's segments at or after the previous stop's. Returns per stop [segment, t, metres
 * off], or null when a stop lies too far from the shape.
 */
export function placeStops(
  shape: Shape,
  stops: [number, number][],
): { seg: number; t: number; off: number }[] | null {
  const n = shape.length / 2;
  if (n < 2) return null;
  const pr = projector(shape[1]!);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pr.x(shape[2 * i]!);
    ys[i] = pr.y(shape[2 * i + 1]!);
  }
  const out: { seg: number; t: number; off: number }[] = [];
  let from = 0;
  let fromT = 0;
  for (const [lon, lat] of stops) {
    const px = pr.x(lon);
    const py = pr.y(lat);
    let best = { seg: from, t: fromT, off: Infinity };
    for (let s = from; s < n - 1; s++) {
      const dx = xs[s + 1]! - xs[s]!;
      const dy = ys[s + 1]! - ys[s]!;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((px - xs[s]!) * dx + (py - ys[s]!) * dy) / len2 : 0;
      t = Math.max(s === from ? fromT : 0, Math.min(1, t));
      const d = Math.hypot(xs[s]! + t * dx - px, ys[s]! + t * dy - py);
      if (d < best.off) best = { seg: s, t, off: d };
      // Past the stop and well away from it again: the nearest pass is behind us. (Loops
      // come back later, so this keeps a stop on its first pass, not its last.)
      else if (best.off < MAX_OFF_M && d > best.off + 2 * MAX_OFF_M) break;
    }
    if (best.off > MAX_OFF_M) return null;
    out.push(best);
    from = best.seg;
    fromT = best.t;
  }
  return out;
}

/**
 * The course of every hop of the patterns, keyed "a,b" with a < b, running from a to b.
 * The first pattern that gives a hop a course keeps it.
 */
export function hopCourses(
  patterns: Pattern[],
  shapes: Map<string, Shape>,
  stopPos: (s: number) => [number, number],
): Hop[] {
  const hops = new Map<string, Hop | null>();
  for (const p of patterns) {
    const shape = shapes.get(p.shape);
    if (!shape) continue;
    const todo = p.stops.some((s, i) => {
      const u = p.stops[i + 1];
      return u !== undefined && u !== s && !hops.has(s < u ? `${s},${u}` : `${u},${s}`);
    });
    if (!todo) continue;
    const placed = placeStops(shape, p.stops.map(stopPos));
    if (!placed) continue;
    for (let i = 0; i + 1 < p.stops.length; i++) {
      const s = p.stops[i]!;
      const u = p.stops[i + 1]!;
      if (s === u) continue;
      const key = s < u ? `${s},${u}` : `${u},${s}`;
      if (hops.has(key)) continue;
      const A = placed[i]!;
      const B = placed[i + 1]!;
      // The shape's points strictly between the two placed stops.
      // Points right at a stop are left out: the line joins the stop itself, without a
      // kink to the track a few metres beside the platform.
      const [sa, sb] = [stopPos(s), stopPos(u)];
      const pr0 = projector(sa[1]);
      const nearStop = (p: [number, number]) =>
        [sa, sb].some(
          (q) => Math.hypot(pr0.x(p[0]) - pr0.x(q[0]), pr0.y(p[1]) - pr0.y(q[1])) < NEAR_STOP_M,
        );
      const pts: [number, number][] = [sa];
      for (let k = A.seg + 1; k <= B.seg; k++) {
        const p: [number, number] = [shape[2 * k]!, shape[2 * k + 1]!];
        if (!nearStop(p)) pts.push(p);
      }
      pts.push(sb);
      const simple = simplify(pts, SIMPLIFY_M);
      if (simple.length <= 2) {
        hops.set(key, null);
        continue;
      }
      const [a0, b0] = [pts[0]!, pts.at(-1)!];
      const pr = projector(a0[1]);
      const straight = Math.hypot(pr.x(b0[0]) - pr.x(a0[0]), pr.y(b0[1]) - pr.y(a0[1]));
      let length = 0;
      for (let k = 1; k < simple.length; k++)
        length += Math.hypot(
          pr.x(simple[k]![0]) - pr.x(simple[k - 1]![0]),
          pr.y(simple[k]![1]) - pr.y(simple[k - 1]![1]),
        );
      if (length > MAX_DETOUR * straight + 300) continue;
      const inner = simple.slice(1, -1);
      hops.set(key, {
        a: Math.min(s, u),
        b: Math.max(s, u),
        inner: s < u ? inner : inner.reverse(),
      });
    }
  }
  return [...hops.values()].filter((h): h is Hop => h !== null);
}
