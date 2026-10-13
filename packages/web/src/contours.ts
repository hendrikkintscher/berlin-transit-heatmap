// Isochrone outlines: lines where the travel time crosses each 5-minute step up to an hour, traced
// from the grid with marching squares and joined into polylines.
import type { FeatureCollection, LineString } from 'geojson';
import { blurSeconds } from './soften';

export const CONTOUR_MINUTES = Array.from({ length: 12 }, (_, i) => 5 * (i + 1));
/** Pieces shorter than this many points are walk bubbles around single stops; dropped. */
const MIN_POINTS = 40;

export interface ContourProps {
  min: number;
}

/**
 * Contour lines of `seconds` (row 0 = north, rows evenly spaced in latitude) at each level.
 * Unreachable cells count as above every level.
 */
export function contours(
  seconds: Float32Array,
  cols: number,
  rows: number,
  bbox: readonly [number, number, number, number],
  minutes: readonly number[] = CONTOUR_MINUTES,
  minPoints = MIN_POINTS,
  /** Points closer than this (in cells) to the simplified line are dropped; 0 keeps all. */
  toleranceCells = 0,
): FeatureCollection<LineString, ContourProps> {
  const [w, s, e, n] = bbox;
  const lon = (x: number) => round(w + ((x + 0.5) / cols) * (e - w));
  const lat = (y: number) => round(n - ((y + 0.5) / rows) * (n - s));
  const traced = traceLevels(
    seconds,
    cols,
    rows,
    minutes.map((min) => min * 60),
  );
  const features = minutes.flatMap((min, l) =>
    traced[l]
      .filter((line) => line.length >= minPoints)
      .map((line) => ({
        type: 'Feature' as const,
        properties: { min },
        geometry: {
          type: 'LineString' as const,
          coordinates: simplify(line, toleranceCells).map(([x, y]) => [lon(x), lat(y)]),
        },
      })),
  );
  return { type: 'FeatureCollection', features };
}

/**
 * Outlines of a travel-time grid: blurred by `blurCells` so walk bubbles round off, and
 * traced at half the resolution (2x2 cells averaged), which the blur hides but which
 * makes this four times cheaper.
 */
export function outlines(
  seconds: Float32Array,
  cols: number,
  rows: number,
  bbox: readonly [number, number, number, number],
  blurCells: number,
  minutes: readonly number[] = CONTOUR_MINUTES,
  /** Added to every time first (a meeting point traces the minutes over its best spot). */
  offset = 0,
): FeatureCollection<LineString, ContourProps> {
  const half = halve(seconds, cols, rows, bbox);
  if (offset) for (let i = 0; i < half.seconds.length; i++) half.seconds[i] += offset;
  const blurred = blurSeconds(half.seconds, half.cols, half.rows, Math.round(blurCells / 2));
  // A cell's height in metres (cells are square), for the simplification's tolerance.
  const cellM = ((half.bbox[3] - half.bbox[1]) / half.rows) * 111_320;
  return contours(
    blurred,
    half.cols,
    half.rows,
    half.bbox,
    minutes,
    MIN_POINTS / 2,
    SIMPLIFY_M / cellM,
  );
}

/**
 * Outline points closer than this to the line without them are dropped: about half the
 * points go (a lighter message and map source); MapLibre simplifies further per zoom, and
 * more than a few metres would show as corners when zoomed far in.
 */
const SIMPLIFY_M = 5;

/** Douglas–Peucker: the points of `line` that keep it within `tolerance` of the original. */
export function simplify(line: [number, number][], tolerance: number): [number, number][] {
  const n = line.length;
  if (tolerance <= 0 || n < 3) return line;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const t2 = tolerance * tolerance;
  const stack = [0, n - 1];
  while (stack.length) {
    const j = stack.pop()!;
    const i = stack.pop()!;
    const [ax, ay] = line[i]!;
    const [bx, by] = line[j]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let farD = t2;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = line[k]!;
      // Squared distance to the segment a-b (to the point a when a ring closes on itself).
      let d: number;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const f = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - f * dx) ** 2 + (py - ay - f * dy) ** 2;
      }
      if (d > farD) {
        farD = d;
        far = k;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push(i, far, far, j);
    }
  }
  return line.filter((_, k) => keep[k]);
}

/** The grid at half the resolution: each cell the mean of the reachable cells in its 2x2 block. */
export function halve(
  seconds: Float32Array,
  cols: number,
  rows: number,
  [w, s, e, n]: readonly [number, number, number, number],
) {
  const c2 = cols >> 1;
  const r2 = rows >> 1;
  const out = new Float32Array(c2 * r2);
  for (let y = 0; y < r2; y++) {
    const top = 2 * y * cols;
    for (let x = 0; x < c2; x++) {
      const k = top + 2 * x;
      let sum = 0;
      let cnt = 0;
      for (let q = 0; q < 4; q++) {
        const v = seconds[k + (q & 1) + (q >> 1) * cols];
        if (v < Infinity) {
          sum += v;
          cnt++;
        }
      }
      out[y * c2 + x] = cnt ? sum / cnt : Infinity;
    }
  }
  const bbox: [number, number, number, number] = [
    w,
    n - ((2 * r2) / rows) * (n - s),
    w + ((2 * c2) / cols) * (e - w),
    n,
  ];
  return { seconds: out, cols: c2, rows: r2, bbox };
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** Polylines in grid coordinates (x = column, y = row) where the field crosses `level`. */
export function traceLevel(
  seconds: Float32Array,
  cols: number,
  rows: number,
  level: number,
): [number, number][][] {
  return traceLevels(seconds, cols, rows, [level])[0];
}

/**
 * traceLevel for several levels in one pass over the grid: most cells cross no level,
 * so each is looked at once rather than once per level.
 */
export function traceLevels(
  seconds: Float32Array,
  cols: number,
  rows: number,
  levels: readonly number[],
): [number, number][][][] {
  const v = new Float32Array(seconds.length);
  for (let i = 0; i < v.length; i++) v[i] = seconds[i] < Infinity ? seconds[i] : 1e9;
  const sorted = [...levels].sort((a, b) => a - b);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  // Edge ids: the horizontal edge from (x,y) to (x+1,y) is 2*(y*cols+x), the vertical
  // edge from (x,y) to (x,y+1) is that plus 1. Each segment links two edges; per level
  // the segments are kept as pairs of edge ids.
  const segs = levels.map((): number[] => []);
  const link = (m: number[], p: number, q: number) => {
    m.push(p, q);
  };
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const i = y * cols + x;
      const a = v[i];
      const b = v[i + 1];
      const c = v[i + cols + 1];
      const d = v[i + cols];
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      // A level runs through the cell when some corner is below it and some is not.
      if (hi < lowest || lo >= highest) continue;
      for (let l = 0; l < levels.length; l++) {
        const level = levels[l];
        if (!(lo < level && hi >= level)) continue;
        const m = segs[l]!;
        const code =
          (a < level ? 8 : 0) | (b < level ? 4 : 0) | (c < level ? 2 : 0) | (d < level ? 1 : 0);
        const top = 2 * i;
        const bottom = 2 * (i + cols);
        const left = 2 * i + 1;
        const right = 2 * (i + 1) + 1;
        switch (code) {
          case 1:
          case 14:
            link(m, left, bottom);
            break;
          case 2:
          case 13:
            link(m, bottom, right);
            break;
          case 3:
          case 12:
            link(m, left, right);
            break;
          case 4:
          case 11:
            link(m, top, right);
            break;
          case 6:
          case 9:
            link(m, top, bottom);
            break;
          case 7:
          case 8:
            link(m, left, top);
            break;
          case 5:
          case 10: {
            // Saddle: the centre value decides which corners connect.
            const centreInside = (a + b + c + d) / 4 < level;
            if ((code === 5) === centreInside) {
              link(m, left, top);
              link(m, bottom, right);
            } else {
              link(m, left, bottom);
              link(m, top, right);
            }
            break;
          }
        }
      }
    }
  }
  const slots = slotsFor(2 * v.length);
  return levels.map((level, l) => join(segs[l]!, slots, v, cols, level));
}

/**
 * An edge's two neighbours along the line (-1: none): a level crosses an edge at most
 * once in each of its two cells, so two slots are enough. Kept between calls, all -1.
 */
let slotCache: Int32Array = new Int32Array(0);
function slotsFor(edges: number): Int32Array {
  if (slotCache.length < 2 * edges) slotCache = new Int32Array(2 * edges).fill(-1);
  return slotCache;
}

/**
 * Joins linked edge crossings into polylines: line ends first, then the closed rings.
 * `segs` holds the links as pairs of edge ids; `slots` is all -1 and left so.
 */
function join(
  segs: number[],
  slots: Int32Array,
  v: Float32Array,
  cols: number,
  level: number,
): [number, number][][] {
  const add = (e: number, x: number) => {
    if (slots[2 * e] === -1) slots[2 * e] = x;
    else slots[2 * e + 1] = x;
  };
  const remove = (e: number, x: number) => {
    if (slots[2 * e] === x) slots[2 * e] = -1;
    else if (slots[2 * e + 1] === x) slots[2 * e + 1] = -1;
  };
  const degree = (e: number) => (slots[2 * e] !== -1 ? 1 : 0) + (slots[2 * e + 1] !== -1 ? 1 : 0);
  for (let k = 0; k < segs.length; k += 2) {
    add(segs[k]!, segs[k + 1]!);
    add(segs[k + 1]!, segs[k]!);
  }
  const point = (edge: number): [number, number] => {
    const i = edge >> 1;
    const x = i % cols;
    const y = (i - x) / cols;
    const a = v[i]!;
    const b = edge & 1 ? v[i + cols]! : v[i + 1]!;
    const f = a === b ? 0.5 : (level - a) / (b - a);
    return edge & 1 ? [x, y + f] : [x + f, y];
  };
  const lines: [number, number][][] = [];
  const take = (start: number) => {
    const line = [point(start)];
    let cur = start;
    for (;;) {
      // The link it came along is already gone: what is left leads on.
      const next = slots[2 * cur] !== -1 ? slots[2 * cur]! : slots[2 * cur + 1]!;
      if (next === -1) break;
      remove(cur, next);
      remove(next, cur);
      line.push(point(next));
      cur = next;
      if (cur === start) break;
    }
    lines.push(line);
  };
  for (const e of segs) if (degree(e) === 1) take(e);
  for (const e of segs) if (degree(e) > 0) take(e);
  return lines;
}
