// The worker's colour images beyond a start's own map: "Bis N Min.", comparing two
// times, and the transit-desert layer.
import type { HeatGrid } from '@berlin-transit-heatmap/routing';
import { DIFF_MAX_S, DIFF_MIN_S, diffLut, homeLut, limitLut, LIMIT_FEATHER_S } from './colors';
import { LUT, mercY, paint, UPSAMPLE, windowUpTo } from './paint';
import type { RasterLayer } from './protocol';
import { blurSeconds } from './soften';

const DIFF_LUT = diffLut();
export const HOME_LUT = homeLut();
const LIMIT_LUTS = new Map<number, Uint8Array>();
/** A map's grid as shown: `offset` is added to its times for the colours. */
export interface Shown {
  id: number;
  grid: HeatGrid;
  offset: number;
}

/** The colour image of the last map: its travel times, or "Bis N Min." in one colour. */
export function paintShown(shown: Shown, limit?: number) {
  if (!limit) return paint(shown.grid, shown.grid.seconds, LUT, shown.offset);
  let lut = LIMIT_LUTS.get(limit);
  if (!lut) LIMIT_LUTS.set(limit, (lut = limitLut(limit)));
  // A meeting point counts everyone's own minutes (the slowest), not the extra ones. Only
  // the area within reach is painted, so fewer minutes paint faster; the map veils all
  // around the image (and the image its unreached cells) in the same white.
  const { grid } = shown;
  const win = windowUpTo(grid.seconds, grid.cols, grid.rows, limit * 60 + LIMIT_FEATHER_S);
  if (!win) return { width: 1, height: 1, rgba: new Uint8ClampedArray(lut.slice(-4)) };
  return paint(grid, grid.seconds, lut, 0, win, true);
}

/**
 * Comparing two times: colours how much longer (or shorter) each trip takes at the
 * second time. Places reachable at only one of them get the strongest colour.
 */
export function paintDiff(a: HeatGrid, b: HeatGrid) {
  const diff = new Float32Array(a.seconds.length);
  for (let i = 0; i < diff.length; i++) {
    const x = a.seconds[i];
    const y = b.seconds[i];
    diff[i] =
      x < Infinity && y < Infinity
        ? Math.max(DIFF_MIN_S, Math.min(DIFF_MAX_S, y - x))
        : x < Infinity
          ? DIFF_MAX_S
          : y < Infinity
            ? DIFF_MIN_S
            : Infinity;
  }
  return paint(a, diff, DIFF_LUT, -DIFF_MIN_S);
}

/** Desert shading: one dark tint, stronger past the second threshold, edges feathered. */
const DESERT_RGB = [36, 22, 64];
const DESERT_ALPHA = [0, 0.36, 0.64];
const DESERT_FEATHER_S = 60;
/** Unreachable cells (no stop within the walking limit) blend as this many seconds. */
const DESERT_FAR_S = 3600;

export function paintDesert(
  grid: HeatGrid,
  [light, strong]: readonly [number, number],
): RasterLayer {
  const { cols, rows } = grid;
  const finite = grid.seconds.map((v) => (v < Infinity ? v : DESERT_FAR_S));
  const seconds = blurSeconds(finite, cols, rows, 1);
  const [, south, , north] = grid.bbox;
  const width = cols * UPSAMPLE;
  const height = rows * UPSAMPLE;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const yN = mercY(north);
  const yS = mercY(south);
  const dLat = (north - south) / rows;
  const ramp = (v: number, edge: number) =>
    Math.min(1, Math.max(0, (v - edge + DESERT_FEATHER_S) / (2 * DESERT_FEATHER_S)));
  for (let j = 0; j < height; j++) {
    const lat = (Math.atan(Math.sinh(yN - ((j + 0.5) * (yN - yS)) / height)) * 180) / Math.PI;
    const fy = Math.min(rows - 1, Math.max(0, (north - lat) / dLat - 0.5));
    const r0 = Math.min(rows - 2, fy | 0);
    const ry = fy - r0;
    let o = j * width * 4;
    for (let x = 0; x < width; x++, o += 4) {
      const fx = Math.min(cols - 1, Math.max(0, (x + 0.5) / UPSAMPLE - 0.5));
      const c = Math.min(cols - 2, fx | 0);
      const rx = fx - c;
      const top = r0 * cols + c;
      const v =
        (seconds[top] + (seconds[top + 1] - seconds[top]) * rx) * (1 - ry) +
        (seconds[top + cols] + (seconds[top + cols + 1] - seconds[top + cols]) * rx) * ry;
      const a =
        DESERT_ALPHA[1] * ramp(v, light) + (DESERT_ALPHA[2] - DESERT_ALPHA[1]) * ramp(v, strong);
      if (a <= 0) continue;
      rgba[o] = DESERT_RGB[0];
      rgba[o + 1] = DESERT_RGB[1];
      rgba[o + 2] = DESERT_RGB[2];
      rgba[o + 3] = a * 255;
    }
  }
  const raw = grid.seconds as Float32Array<ArrayBuffer>;
  return { image: { width, height, rgba }, bbox: grid.bbox, grid: { cols, rows, seconds: raw } };
}
