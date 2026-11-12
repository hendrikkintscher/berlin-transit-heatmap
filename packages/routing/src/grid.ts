import { M_PER_DEG_LAT, metresPerDegLon } from './geo';
import type { PreparedTimetable } from './prepare';
import {
  sameEdgeCellMetres,
  snapCells,
  snapOrigin,
  snapStops,
  walkFront,
  walkFrontFringe,
  walkSpeeds,
  WalkSources,
  type WalkFront,
} from './walk';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  HeatGrid,
  HeatGridOptions,
  TravelTimeResult,
} from './types';
import { REGION } from './regions';

/** The region's grid area (regions.ts): [minLon, minLat, maxLon, maxLat]. */
export const DEFAULT_BBOX: [number, number, number, number] = REGION.bbox;

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
  const fallbackWalk = Math.max(maxWalk, opts.maxFallbackWalkSeconds ?? 2 * maxWalk);
  const [minLon, minLat, maxLon0, maxLat] = opts.bbox ?? DEFAULT_BBOX;
  if (!(cellSizeM > 0)) throw new Error('cellSizeM must be positive');

  const midLat = (minLat + maxLat) / 2;
  const mPerLon = metresPerDegLon(midLat);
  const dLat = cellSizeM / M_PER_DEG_LAT;
  const dLon = cellSizeM / mPerLon;
  const cols = Math.max(1, Math.ceil((maxLon0 - minLon) / dLon - 1e-9));
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / dLat - 1e-9));
  // Only a window of the cells, when asked (its own bbox below); the whole grid otherwise.
  const win = opts.window;
  const wc0 = win ? Math.max(0, win.c0) : 0;
  const wr0 = win ? Math.max(0, win.r0) : 0;
  const wc1 = win ? Math.min(cols, win.c0 + win.cols) : cols;
  const wr1 = win ? Math.min(rows, win.r0 + win.rows) : rows;
  const outCols = Math.max(0, wc1 - wc0);
  const outRows = Math.max(0, wr1 - wr0);
  const seconds = new Float32Array(outCols * outRows).fill(Infinity);
  const nearest = opts.trackStops ? new Int32Array(outCols * outRows).fill(-1) : null;

  const speeds = walkSpeeds(opts.walkSpeedMps);
  const radiusM = fallbackWalk * speeds.straight;
  const radCols = Math.ceil(radiusM / cellSizeM) + 1;
  const r2 = radiusM * radiusM;
  const invSpeed = 1 / speeds.straight;

  // Scatter one source (a stop or the origin) onto nearby cells.
  const scatter = (lat: number, lon: number, startSeconds: number, stop: number): void => {
    // Fractional cell coordinates of the source (cell centres sit at k + 0.5).
    const fc = (lon - minLon) / dLon;
    const fr = (maxLat - lat) / dLat;
    const c0 = Math.max(wc0, Math.floor(fc) - radCols);
    const c1 = Math.min(wc1 - 1, Math.floor(fc) + radCols);
    const rr0 = Math.max(wr0, Math.floor(fr) - radCols);
    const rr1 = Math.min(wr1 - 1, Math.floor(fr) + radCols);
    for (let r = rr0; r <= rr1; r++) {
      const dy = (r + 0.5 - fr) * cellSizeM;
      const dy2 = dy * dy;
      if (dy2 > r2) continue;
      // Columns whose centre lies within the walking radius on this row.
      const half = Math.sqrt(r2 - dy2) / cellSizeM;
      const cs = Math.max(c0, Math.ceil(fc - 0.5 - half));
      const ce = Math.min(c1, Math.floor(fc - 0.5 + half));
      const rowBase = (r - wr0) * outCols - wc0;
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
  const egress = opts.egressPenaltySeconds ?? 0;
  const net = opts.walk;
  const stopSnap = net ? snapStops(net, tt) : null;
  const originSnap = net && result.origin ? snapOrigin(net, result.origin) : null;
  // Sources off the walking network (or all, without one) walk in a straight line.
  for (let s = 0; s < tt.stopCount; s++) {
    const t = stopSeconds[s];
    if (t === Infinity || t !== t || (stopSnap && stopSnap.edge[s] >= 0)) continue;
    scatter(tt.stopLat[s], tt.stopLon[s], t + egress, s);
  }
  if (result.origin && !(originSnap && originSnap.edge[0] >= 0))
    scatter(result.origin.lat, result.origin.lon, 0, -1);

  if (net && stopSnap) {
    const pace = 1 / speeds.network;
    const maxM = maxWalk * speeds.network;
    const fallbackM = fallbackWalk * speeds.network;
    const sources = new WalkSources(pace);
    const cells = snapCells(
      net,
      [minLon, maxLat - rows * dLat, minLon + cols * dLon, maxLat],
      cols,
      rows,
    );
    // A window walks only from sources that can reach it: a walk is never shorter than
    // the straight line, so one further than fallbackM from every end of its cells' edges
    // cannot (the whole map walks from all).
    let near = (_lat: number, _lon: number, _extraM: number) => true;
    if (win) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let r = wr0; r < wr1; r++)
        for (let c = wc0; c < wc1; c++) {
          const k = r * cols + c;
          if (cells.a[k] < 0) continue;
          for (const v of [cells.a[k], cells.b[k]]) {
            x0 = Math.min(x0, net.x[v]);
            x1 = Math.max(x1, net.x[v]);
            y0 = Math.min(y0, net.y[v]);
            y1 = Math.max(y1, net.y[v]);
          }
        }
      near = (lat, lon, extraM) => {
        const px = (lon - net.lon0) * net.mPerLon;
        const py = (lat - net.lat0) * M_PER_DEG_LAT;
        const dx = Math.max(0, x0 - px, px - x1);
        const dy = Math.max(0, y0 - py, py - y1);
        // A metre to spare for the network's float32 positions.
        return dx * dx + dy * dy <= (fallbackM + extraM + 1) ** 2;
      };
    }
    // Stops sitting on each edge, so cells on the same edge can walk straight to them.
    const edgeStop = new Map<number, number[]>();
    for (let s = 0; s < tt.stopCount; s++) {
      const t = stopSeconds[s];
      if (t === Infinity || t !== t || stopSnap.edge[s] < 0) continue;
      if (!near(tt.stopLat[s], tt.stopLon[s], 0)) continue;
      sources.add(net, stopSnap, s, t + egress, 0, s);
      const list = edgeStop.get(stopSnap.edge[s]);
      if (list) list.push(s);
      else edgeStop.set(stopSnap.edge[s], [s]);
    }
    const originEdge = originSnap ? originSnap.edge[0] : -1;
    // The origin may go further than the stops: it starts with that much "less walked".
    const originExtraM = Math.max(0, (opts.maxOriginSeconds ?? 0) * speeds.network - fallbackM);
    // Going further than the stops, the origin's own walk (riding all the way) counts as
    // one within maxM all the way: it is not held back by a later stop's shorter walk.
    const originM = originExtraM > 0 ? fallbackM : maxM;
    if (originSnap && originEdge >= 0 && near(result.origin!.lat, result.origin!.lon, originExtraM))
      sources.add(net, originSnap, 0, 0, -originExtraM, -1);
    const { a: cellA, b: cellB, da: cellDa, db: cellDb } = cells;
    // With one cap for every walk (on foot), the later labels count only at cell ends whose
    // earliest label walks too far for a cell (the test below): there, the nearest such cell.
    const fringe = (f: WalkFront, near: Float32Array) => {
      const { time, walk } = f;
      for (let r = wr0; r < wr1; r++)
        for (let k = r * cols + wc0, k1 = r * cols + wc1; k < k1; k++) {
          const a = cellA[k];
          if (a < 0) continue;
          const b = cellB[k];
          const da = cellDa[k];
          const db = cellDb[k];
          if (time[a] < Infinity && walk[a] + da > maxM && da < near[a]) near[a] = da;
          if (time[b] < Infinity && walk[b] + db > maxM && db < near[b]) near[b] = db;
        }
    };
    const oneCap = maxM === fallbackM && originM === fallbackM;
    const front = oneCap
      ? walkFrontFringe(
          net,
          sources.nodes,
          sources.times,
          sources.walked,
          sources.tags,
          fallbackM,
          pace,
          fringe,
        )
      : walkFront(net, sources.nodes, sources.times, sources.walked, sources.tags, fallbackM, pace);
    const { time, walk, source, more, xnext, xtime, xwalk, xsource } = front;
    const cellEdge = cells.edge;
    // Edges with a stop on them, so the map lookup below runs only where it can find one.
    const hasStop = new Uint8Array(net.edgeCount);
    for (const e of edgeStop.keys()) hasStop[e] = 1;
    for (let o = 0; o < outCols * outRows; o++) {
      // The cell in the whole grid (snaps and ends are the whole grid's).
      const k = (wr0 + Math.floor(o / outCols)) * cols + wc0 + (o % outCols);
      const a = cellA[k];
      if (a < 0) continue;
      const e = cellEdge[k];
      const da = cellDa[k];
      const db = cellDb[k];
      const b = cellB[k];
      // Walks within maxM win; longer ones up to fallbackM count only where none is.
      // The earliest label at each end, and where its walk is too long the later ones,
      // which walk less (walkFrontFringe keeps them where they count).
      let v = Infinity;
      let from = -1;
      let fv = Infinity;
      let ffrom = -1;
      let w: number;
      let t: number;
      for (let end = 0; end < 2; end++) {
        const n0 = end === 0 ? a : b;
        const d = end === 0 ? da : db;
        w = walk[n0] + d;
        t = time[n0] + d * pace;
        if (w <= (source[n0] === -1 ? originM : maxM)) {
          // No later label is earlier.
          if (t < v) {
            v = t;
            from = source[n0];
          }
          continue;
        }
        if (w <= fallbackM && t < fv) {
          fv = t;
          ffrom = source[n0];
        }
        for (let l = more[n0]; l !== -1; l = xnext[l]) {
          w = xwalk[l] + d;
          t = xtime[l] + d * pace;
          if (w <= (xsource[l] === -1 ? originM : maxM)) {
            if (t < v) {
              v = t;
              from = xsource[l];
            }
          } else if (w <= fallbackM && t < fv) {
            fv = t;
            ffrom = xsource[l];
          }
        }
      }
      // Sources on the cell's own edge walk straight along it.
      const here = hasStop[e] ? edgeStop.get(e) : undefined;
      if (here)
        for (const s of here) {
          w = sameEdgeCellMetres(net, stopSnap, s, cells, k);
          t = stopSeconds[s] + egress + w * pace;
          if (w <= maxM) {
            if (t < v) {
              v = t;
              from = s;
            }
          } else if (w <= fallbackM && t < fv) {
            fv = t;
            ffrom = s;
          }
        }
      if (e === originEdge) {
        w = sameEdgeCellMetres(net, originSnap!, 0, cells, k);
        t = w * pace;
        if (w <= maxM) {
          if (t < v) {
            v = t;
            from = -1;
          }
        } else if (w <= fallbackM && t < fv) {
          fv = t;
          ffrom = -1;
        }
      }
      if (v === Infinity) {
        v = fv;
        from = ffrom;
      }
      if (v < seconds[o]) {
        seconds[o] = v;
        if (nearest) nearest[o] = from;
      }
    }
  }

  const grid: HeatGrid = {
    cellSizeM,
    bbox: [
      minLon + wc0 * dLon,
      maxLat - (wr0 + outRows) * dLat,
      minLon + (wc0 + outCols) * dLon,
      maxLat - wr0 * dLat,
    ],
    cols: outCols,
    rows: outRows,
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
  const k = cellAt(grid, lat, lon);
  return k < 0 ? Infinity : grid.seconds[k]!;
}

/** A grid's shape: its bounds [west, south, east, north] and size in cells. */
export interface GridShape {
  bbox: readonly [number, number, number, number];
  cols: number;
  rows: number;
}

/** Column and row of the cell at a position; outside the grid they are out of range. */
export function cellColRow(grid: GridShape, lat: number, lon: number): [number, number] {
  const [w, s, e, n] = grid.bbox;
  return [
    Math.floor(((lon - w) / (e - w)) * grid.cols),
    Math.floor(((n - lat) / (n - s)) * grid.rows),
  ];
}

/** Index of the cell at a position (row by row from the north-west); -1 outside the grid. */
export function cellAt(grid: GridShape, lat: number, lon: number): number {
  const [c, r] = cellColRow(grid, lat, lon);
  return c < 0 || c >= grid.cols || r < 0 || r >= grid.rows ? -1 : r * grid.cols + c;
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
