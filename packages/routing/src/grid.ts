import { M_PER_DEG_LAT, metresPerDegLon } from './geo';
import type { PreparedTimetable } from './prepare';
import {
  sameEdgeMetres,
  snapCells,
  snapOrigin,
  sharedLabels,
  snapStops,
  walkFrom,
  walkSpeeds,
  WalkSources,
} from './walk';
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
  const nearest = opts.trackStops ? new Int32Array(cols * rows).fill(-1) : null;

  const speeds = walkSpeeds(opts.walkSpeedMps);
  const radiusM = maxWalk * speeds.straight;
  const radCols = Math.ceil(radiusM / cellSizeM) + 1;
  const r2 = radiusM * radiusM;
  const invSpeed = 1 / speeds.straight;

  // Scatter one source (a stop or the origin) onto nearby cells.
  const scatter = (lat: number, lon: number, startSeconds: number, stop: number): void => {
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
      // Columns whose centre lies within the walking radius on this row.
      const half = Math.sqrt(r2 - dy2) / cellSizeM;
      const cs = Math.max(c0, Math.ceil(fc - 0.5 - half));
      const ce = Math.min(c1, Math.floor(fc - 0.5 + half));
      const rowBase = r * cols;
      for (let c = cs; c <= ce; c++) {
        const dx = (c + 0.5 - fc) * cellSizeM;
        const v = startSeconds + Math.sqrt(dx * dx + dy2) * invSpeed;
        const k = rowBase + c;
        if (v < seconds[k]) {
          seconds[k] = v;
          if (nearest) nearest[k] = stop;
        }
      }
    }
  };

  const stopSeconds = result.stopSeconds;
  const net = opts.walk;
  const stopSnap = net ? snapStops(net, tt) : null;
  const originSnap = net && result.origin ? snapOrigin(net, result.origin) : null;
  // Sources off the walking network (or all, without one) walk in a straight line.
  for (let s = 0; s < tt.stopCount; s++) {
    const t = stopSeconds[s];
    if (t === Infinity || t !== t || (stopSnap && stopSnap.edge[s] >= 0)) continue;
    scatter(tt.stopLat[s], tt.stopLon[s], t, s);
  }
  if (result.origin && !(originSnap && originSnap.edge[0] >= 0))
    scatter(result.origin.lat, result.origin.lon, 0, -1);

  if (net && stopSnap) {
    const pace = 1 / speeds.network;
    const maxM = maxWalk * speeds.network;
    const sources = new WalkSources(pace);
    // Stops sitting on each edge, so cells on the same edge can walk straight to them.
    const edgeStop = new Map<number, number[]>();
    for (let s = 0; s < tt.stopCount; s++) {
      const t = stopSeconds[s];
      if (t === Infinity || t !== t || stopSnap.edge[s] < 0) continue;
      sources.add(net, stopSnap, s, t, 0, s);
      const list = edgeStop.get(stopSnap.edge[s]);
      if (list) list.push(s);
      else edgeStop.set(stopSnap.edge[s], [s]);
    }
    const originEdge = originSnap ? originSnap.edge[0] : -1;
    if (originSnap && originEdge >= 0) sources.add(net, originSnap, 0, 0, 0, -1);
    const labels = walkFrom(
      net,
      sources.nodes,
      sources.times,
      sources.walked,
      sources.tags,
      maxM,
      pace,
      sharedLabels(net),
    );
    const cells = snapCells(net, [minLon, gridMinLat, maxLon, maxLat], cols, rows);
    const { edgeA, edgeB, edgeMetres } = net;
    const { time, walk, source } = labels;
    const cellEdge = cells.edge;
    const cellAlong = cells.along;
    const cellOff = cells.metres;
    for (let k = 0; k < cols * rows; k++) {
      const e = cellEdge[k];
      if (e < 0) continue;
      const len = edgeMetres[e];
      const off = cellOff[k];
      const da = cellAlong[k] * len + off;
      const db = len + 2 * off - da;
      const a = edgeA[e];
      const b = edgeB[e];
      let v = Infinity;
      let from = -1;
      if (walk[a] + da <= maxM) {
        v = time[a] + da * pace;
        from = source[a];
      }
      if (walk[b] + db <= maxM && time[b] + db * pace < v) {
        v = time[b] + db * pace;
        from = source[b];
      }
      // Sources on the cell's own edge walk straight along it.
      const here = edgeStop.size > 0 ? edgeStop.get(e) : undefined;
      if (here)
        for (const s of here) {
          const w = sameEdgeMetres(net, stopSnap, s, cells, k);
          if (w <= maxM && stopSeconds[s] + w * pace < v) {
            v = stopSeconds[s] + w * pace;
            from = s;
          }
        }
      if (e === originEdge) {
        const w = sameEdgeMetres(net, originSnap!, 0, cells, k);
        if (w <= maxM && w * pace < v) {
          v = w * pace;
          from = -1;
        }
      }
      if (v < seconds[k]) {
        seconds[k] = v;
        if (nearest) nearest[k] = from;
      }
    }
  }

  const grid: HeatGrid = {
    cellSizeM,
    bbox: [minLon, gridMinLat, maxLon, maxLat],
    cols,
    rows,
    seconds,
  };
  if (nearest) grid.stop = nearest;
  return grid;
}

/** The bbox (snapped outwards to whole cells), columns and rows heatGrid uses for these options. */
export function gridLayout(opts: Pick<HeatGridOptions, 'cellSizeM' | 'bbox'> = {}): {
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
} {
  const cellSizeM = opts.cellSizeM ?? DEFAULT_CELL_M;
  const [minLon, minLat, maxLon0, maxLat] = opts.bbox ?? DEFAULT_BBOX;
  const dLat = cellSizeM / M_PER_DEG_LAT;
  const dLon = cellSizeM / metresPerDegLon((minLat + maxLat) / 2);
  const cols = Math.max(1, Math.ceil((maxLon0 - minLon) / dLon - 1e-9));
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / dLat - 1e-9));
  return { bbox: [minLon, maxLat - rows * dLat, minLon + cols * dLon, maxLat], cols, rows };
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
