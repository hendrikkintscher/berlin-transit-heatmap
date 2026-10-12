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
          coordinates: line.map(([x, y]) => [lon(x), lat(y)]),
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
): FeatureCollection<LineString, ContourProps> {
  const half = halve(seconds, cols, rows, bbox);
  const blurred = blurSeconds(half.seconds, half.cols, half.rows, Math.round(blurCells / 2));
  return contours(blurred, half.cols, half.rows, half.bbox, minutes, MIN_POINTS / 2);
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
  // edge from (x,y) to (x,y+1) is that plus 1. Each segment links two edges.
  const links = levels.map(() => new Map<number, number[]>());
  const link = (m: Map<number, number[]>, p: number, q: number) => {
    const a = m.get(p);
    if (a) a.push(q);
    else m.set(p, [q]);
    const b = m.get(q);
    if (b) b.push(p);
    else m.set(q, [p]);
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
        const m = links[l];
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
  return levels.map((level, l) => join(links[l], v, cols, level));
}

/** Joins linked edge crossings into polylines: line ends first, then the closed rings. */
function join(
  links: Map<number, number[]>,
  v: Float32Array,
  cols: number,
  level: number,
): [number, number][][] {
  const point = (edge: number): [number, number] => {
    const i = edge >> 1;
    const x = i % cols;
    const y = (i - x) / cols;
    const a = v[i];
    const b = edge & 1 ? v[i + cols] : v[i + 1];
    const f = a === b ? 0.5 : (level - a) / (b - a);
    return edge & 1 ? [x, y + f] : [x + f, y];
  };
  const lines: [number, number][][] = [];
  const take = (start: number) => {
    const line = [point(start)];
    let prev = -1;
    let cur = start;
    for (;;) {
      const next = (links.get(cur) ?? []).find((e) => e !== prev);
      const ends = links.get(cur);
      if (ends && next !== undefined) ends.splice(ends.indexOf(next), 1);
      if (next === undefined) break;
      const back = links.get(next)!;
      back.splice(back.indexOf(cur), 1);
      line.push(point(next));
      prev = cur;
      cur = next;
      if (cur === start) break;
    }
    lines.push(line);
  };
  for (const [edge, l] of links) if (l.length === 1) take(edge);
  for (const [edge, l] of links) if (l.length > 0) take(edge);
  return lines;
}
