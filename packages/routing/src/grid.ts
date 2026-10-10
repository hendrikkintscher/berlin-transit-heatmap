import { M_PER_DEG_LAT, metresPerDegLon, WALK_SPEED_MPS } from './geo';
import type { PreparedTimetable } from './prepare';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  HeatGrid,
  HeatGridOptions,
  TravelTimeResult,
} from './types';

/** Berlin with a small margin: [minLon, minLat, maxLon, maxLat]. */
export const DEFAULT_BBOX: [number, number, number, number] = [13.08, 52.33, 13.77, 52.68];

const DEFAULT_CELL_M = 250;
const DEFAULT_MAX_FINAL_WALK_S = 900;
const DEFAULT_BAND_S = 300;

/**
 * Rasterises stop travel times onto a regular grid. A cell's value is the
 * minimum over reachable stops within `maxFinalWalkSeconds` of the cell
 * centre of (stop travel time + straight-line walk), and also the direct walk
 * from the origin when the result carries one.
 */
export function heatGrid(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  opts: HeatGridOptions = {},
): HeatGrid {
  const cellSizeM = opts.cellSizeM ?? DEFAULT_CELL_M;
  const maxWalk = opts.maxFinalWalkSeconds ?? DEFAULT_MAX_FINAL_WALK_S;
  const [minLon, minLat, maxLon0, maxLat] = opts.bbox ?? DEFAULT_BBOX;
  if (!(cellSizeM > 0)) throw new Error('cellSizeM must be positive');

  const midLat = (minLat + maxLat) / 2;
  const mPerLon = metresPerDegLon(midLat);
  const dLat = cellSizeM / M_PER_DEG_LAT;
  const dLon = cellSizeM / mPerLon;
  const cols = Math.max(1, Math.ceil((maxLon0 - minLon) / dLon - 1e-9));
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / dLat - 1e-9));
  const maxLon = minLon + cols * dLon;
  const gridMinLat = maxLat - rows * dLat;
  const seconds = new Float32Array(cols * rows).fill(Infinity);

  const radiusM = maxWalk * WALK_SPEED_MPS;
  const radCols = Math.ceil(radiusM / cellSizeM) + 1;
  const r2 = radiusM * radiusM;

  // Scatter one source (a stop or the origin) onto nearby cells.
  const scatter = (lat: number, lon: number, startSeconds: number): void => {
    // Fractional cell coordinates of the source (cell centres sit at k + 0.5).
    const fc = (lon - minLon) / dLon;
    const fr = (maxLat - lat) / dLat;
    const c0 = Math.max(0, Math.floor(fc) - radCols);
    const c1 = Math.min(cols - 1, Math.floor(fc) + radCols);
    const rr0 = Math.max(0, Math.floor(fr) - radCols);
    const rr1 = Math.min(rows - 1, Math.floor(fr) + radCols);
    for (let r = rr0; r <= rr1; r++) {
      const dy = (r + 0.5 - fr) * cellSizeM;
      const dy2 = dy * dy;
      if (dy2 > r2) continue;
      const rowBase = r * cols;
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5 - fc) * cellSizeM;
        const d2 = dx * dx + dy2;
        if (d2 > r2) continue;
        const v = startSeconds + Math.sqrt(d2) / WALK_SPEED_MPS;
        const k = rowBase + c;
        if (v < seconds[k]) seconds[k] = v;
      }
    }
  };

  const stopSeconds = result.stopSeconds;
  for (let s = 0; s < tt.stopCount; s++) {
    const t = stopSeconds[s];
    if (t === Infinity || t !== t) continue;
    scatter(tt.stopLat[s], tt.stopLon[s], t);
  }
  if (result.origin) scatter(result.origin.lat, result.origin.lon, 0);

  return { cellSizeM, bbox: [minLon, gridMinLat, maxLon, maxLat], cols, rows, seconds };
}

/** Travel time in seconds of the grid cell containing (lat, lon); Infinity if unreachable or outside the grid. */
export function gridValueAt(grid: HeatGrid, lat: number, lon: number): number {
  const [minLon, minLat, maxLon, maxLat] = grid.bbox;
  const c = Math.floor(((lon - minLon) / (maxLon - minLon)) * grid.cols);
  const r = Math.floor(((maxLat - lat) / (maxLat - minLat)) * grid.rows);
  if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) return Infinity;
  return grid.seconds[r * grid.cols + c];
}

/**
 * One square polygon per reachable cell, with properties
 * `seconds` (rounded to whole seconds) and `band = floor(seconds / bandSeconds)`.
 */
export function gridToGeoJSON(
  grid: HeatGrid,
  bandSeconds: number = DEFAULT_BAND_S,
): GeoJSONFeatureCollection {
  const [minLon, minLat, maxLon, maxLat] = grid.bbox;
  const dLon = (maxLon - minLon) / grid.cols;
  const dLat = (maxLat - minLat) / grid.rows;
  const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
  const features: GeoJSONFeature[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const north = round6(maxLat - r * dLat);
    const south = round6(maxLat - (r + 1) * dLat);
    for (let c = 0; c < grid.cols; c++) {
      const v = grid.seconds[r * grid.cols + c];
      if (v === Infinity || v !== v) continue;
      const sec = Math.round(v);
      const west = round6(minLon + c * dLon);
      const east = round6(minLon + (c + 1) * dLon);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
        properties: { band: Math.floor(sec / bandSeconds), seconds: sec },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
