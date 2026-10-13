import type { HeatGrid } from '@berlin-transit-heatmap/routing';
import { colorLut } from './colors';
import { BlurScratch, blurSeconds, warpField } from './soften';

/**
 * The image has UPSAMPLE x UPSAMPLE pixels per grid cell. One 50 m pixel per cell looks the
 * same as 25 m ones once MapLibre resamples it linearly, at a quarter of the painting.
 */
export const UPSAMPLE = 1;
const UPSAMPLE_SHIFT = 0;
/** Softening, in grid cells (50 m) and seconds. Purely visual; the readout uses the raw grid. */
export const SOFT = { blurCells: 2, warpCells: 2.5, warpWavelengthCells: 9, featherSeconds: 45 };
export const LUT = colorLut(SOFT.featherSeconds);
/** Blur for the isochrone outlines, in grid cells (50 m). */
export const OUTLINE_BLUR_CELLS = 6;

/** The softened times while painting, reused from map to map. */
const paintScratch = new BlurScratch();

export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * Colours the grid into RGBA pixels at UPSAMPLE x its resolution. For looks the
 * travel times are blurred a little, sampled at a gently wobbled position (so the
 * walking circles around stops become organic shapes) and interpolated
 * bilinearly between cells; band edges are feathered in the colour table. The
 * grid's rows are evenly spaced in latitude but the map is Web Mercator, so each
 * image row samples the grid at its own latitude.
 */
export function paint(
  grid: HeatGrid,
  values?: Float32Array,
  lut = LUT,
  offset = 0,
  win?: PaintWindow,
  /** Unreached cells take the lookup's last entry instead of staying clear. */
  fillUnreached = false,
): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer>; bbox?: Bbox } {
  const { cols: fullCols } = grid;
  const { c0, r0, cols, rows } = win ?? { c0: 0, r0: 0, cols: grid.cols, rows: grid.rows };
  const lutMax = lut.length / 4 - 1;
  const all = values ?? grid.seconds;
  // Only the window's cells (the whole grid without one) are softened and painted.
  const seconds = blurSeconds(
    win ? cropCells(all, fullCols, win) : all,
    cols,
    rows,
    SOFT.blurCells,
    2,
    paintScratch,
  );
  const [west, gridSouth, east, gridNorth] = grid.bbox;
  const dLat = (gridNorth - gridSouth) / grid.rows;
  const dLon = (east - west) / fullCols;
  const north = gridNorth - r0 * dLat;
  const south = north - rows * dLat;
  const width = cols * UPSAMPLE;
  const height = rows * UPSAMPLE;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const yN = mercY(north);
  const yS = mercY(south);
  // The wobble is the whole grid's, so a window has the same shapes as the full map.
  const warp = warpOf(fullCols, grid.rows);
  for (let j = 0; j < height; j++) {
    const lat = (Math.atan(Math.sinh(yN - ((j + 0.5) * (yN - yS)) / height)) * 180) / Math.PI;
    const fy0 = (north - lat) / dLat - 0.5;
    const wRow = (r0 + Math.min(rows - 1, Math.max(0, Math.round(fy0)))) * fullCols + c0;
    let o = j * width * 4;
    for (let x = 0; x < width; x++, o += 4) {
      const fx0 = (x + 0.5) / UPSAMPLE - 0.5;
      const w = wRow + (x >> UPSAMPLE_SHIFT);
      let fx = fx0 + warp.dx[w];
      let fy = fy0 + warp.dy[w];
      fx = fx < 0 ? 0 : fx > cols - 1 ? cols - 1 : fx;
      fy = fy < 0 ? 0 : fy > rows - 1 ? rows - 1 : fy;
      let c = fx | 0;
      let r = fy | 0;
      if (c > cols - 2) c = cols - 2;
      if (r > rows - 2) r = rows - 2;
      const rx = fx - c;
      const ry = fy - r;
      const top = r * cols + c;
      const a = seconds[top];
      const b = seconds[top + 1];
      const d = seconds[top + cols];
      const e = seconds[top + cols + 1];
      let v: number;
      if (a < Infinity && b < Infinity && d < Infinity && e < Infinity) {
        v = (a + (b - a) * rx) * (1 - ry) + (d + (e - d) * rx) * ry;
      } else {
        // At the edge of the reachable area: nearest cell, no blending with "unreachable".
        v = ry < 0.5 ? (rx < 0.5 ? a : b) : rx < 0.5 ? d : e;
        if (!(v < Infinity) && !fillUnreached) continue;
      }
      const i = v + offset;
      const k = (i >= lutMax ? lutMax : i <= 0 ? 0 : (i + 0.5) | 0) * 4;
      rgba[o] = lut[k];
      rgba[o + 1] = lut[k + 1];
      rgba[o + 2] = lut[k + 2];
      rgba[o + 3] = lut[k + 3];
    }
  }
  if (!win) return { width, height, rgba };
  const left = west + c0 * dLon;
  return { width, height, rgba, bbox: [left, south, left + cols * dLon, north] };
}

type Bbox = [number, number, number, number];
/** A rectangle of grid cells: its first column and row and its size. */
interface PaintWindow {
  c0: number;
  r0: number;
  cols: number;
  rows: number;
}

/** Margin around the shaded cells for the blur and the wobble, in cells. */
const WINDOW_PAD = 2 * SOFT.blurCells + Math.ceil(SOFT.warpCells) + 2;

/**
 * The smallest window of cells holding every value up to `max` (with a margin for the
 * softening), in one pass over the grid; null when none is that low.
 */
export function windowUpTo(values: Float32Array, cols: number, rows: number, max: number) {
  let c0 = cols;
  let c1 = -1;
  let r0 = rows;
  let r1 = -1;
  for (let r = 0, k = 0; r < rows; r++) {
    let first = -1;
    let last = -1;
    for (let c = 0; c < cols; c++, k++) {
      if (values[k] <= max) {
        if (first < 0) first = c;
        last = c;
      }
    }
    if (first < 0) continue;
    if (r < r0) r0 = r;
    r1 = r;
    if (first < c0) c0 = first;
    if (last > c1) c1 = last;
  }
  if (r1 < 0) return null;
  c0 = Math.max(0, c0 - WINDOW_PAD);
  r0 = Math.max(0, r0 - WINDOW_PAD);
  c1 = Math.min(cols - 1, c1 + WINDOW_PAD);
  r1 = Math.min(rows - 1, r1 + WINDOW_PAD);
  // Bilinear sampling needs two cells each way.
  if (c1 - c0 < 1 || r1 - r0 < 1) return null;
  return { c0, r0, cols: c1 - c0 + 1, rows: r1 - r0 + 1 };
}

function cropCells(values: Float32Array, cols: number, win: PaintWindow): Float32Array {
  const out = new Float32Array(win.cols * win.rows);
  for (let r = 0; r < win.rows; r++) {
    const from = (win.r0 + r) * cols + win.c0;
    out.set(values.subarray(from, from + win.cols), r * win.cols);
  }
  return out;
}

let warpCache: { key: string; field: ReturnType<typeof warpField> } | null = null;
/** The wobble pattern depends only on the grid size, so it is built once. */
function warpOf(cols: number, rows: number) {
  const key = `${cols}x${rows}`;
  if (warpCache?.key !== key) {
    warpCache = { key, field: warpField(cols, rows, SOFT.warpCells, SOFT.warpWavelengthCells) };
  }
  return warpCache.field;
}
