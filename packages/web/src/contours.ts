// Isochrone outlines: lines where the travel time crosses each 5-minute step up to an hour, traced
// from the grid with marching squares and joined into polylines.
import type { FeatureCollection, LineString } from 'geojson';

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
): FeatureCollection<LineString, ContourProps> {
  const [w, s, e, n] = bbox;
  const lon = (x: number) => round(w + ((x + 0.5) / cols) * (e - w));
  const lat = (y: number) => round(n - ((y + 0.5) / rows) * (n - s));
  const features = minutes.flatMap((min) =>
    traceLevel(seconds, cols, rows, min * 60)
      .filter((line) => line.length >= MIN_POINTS)
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

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** Polylines in grid coordinates (x = column, y = row) where the field crosses `level`. */
export function traceLevel(
  seconds: Float32Array,
  cols: number,
  rows: number,
  level: number,
): [number, number][][] {
  const v = (x: number, y: number) => {
    const t = seconds[y * cols + x];
    return t < Infinity ? t : 1e9;
  };
  // Edge ids: the horizontal edge from (x,y) to (x+1,y) is 2*(y*cols+x), the vertical
  // edge from (x,y) to (x,y+1) is that plus 1. Each segment links two edges.
  const hEdge = (x: number, y: number) => 2 * (y * cols + x);
  const vEdge = (x: number, y: number) => 2 * (y * cols + x) + 1;
  const point = (edge: number): [number, number] => {
    const i = edge >> 1;
    const x = i % cols;
    const y = (i - x) / cols;
    const a = v(x, y);
    const b = edge & 1 ? v(x, y + 1) : v(x + 1, y);
    const f = a === b ? 0.5 : (level - a) / (b - a);
    return edge & 1 ? [x, y + f] : [x + f, y];
  };
  const links = new Map<number, number[]>();
  const link = (p: number, q: number) => {
    for (const [from, to] of [
      [p, q],
      [q, p],
    ]) {
      const l = links.get(from);
      if (l) l.push(to);
      else links.set(from, [to]);
    }
  };
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const tl = v(x, y) < level;
      const tr = v(x + 1, y) < level;
      const br = v(x + 1, y + 1) < level;
      const bl = v(x, y + 1) < level;
      const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = hEdge(x, y);
      const bottom = hEdge(x, y + 1);
      const left = vEdge(x, y);
      const right = vEdge(x + 1, y);
      switch (code) {
        case 1:
        case 14:
          link(left, bottom);
          break;
        case 2:
        case 13:
          link(bottom, right);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 4:
        case 11:
          link(top, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 7:
        case 8:
          link(left, top);
          break;
        case 5:
        case 10: {
          // Saddle: the centre value decides which corners connect.
          const centreInside = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 < level;
          if ((code === 5) === centreInside) {
            link(left, top);
            link(bottom, right);
          } else {
            link(left, bottom);
            link(top, right);
          }
          break;
        }
      }
    }
  }
  // Join segments into polylines: start from line ends first, then close the rings.
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
