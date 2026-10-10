// Temporary stand-in for the `routing` workspace package (Contract 2 of the alpha plan).
// It exposes the same API but fakes the travel times from straight-line distance,
// so the web app can be built and tested before the real RAPTOR engine lands.
// Delete this file and point ./index.ts at `routing` once that package is merged.
import type { FeatureCollection, Polygon } from 'geojson';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  parent?: number;
}
export interface Route {
  name: string;
  mode: 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'ferry' | 'regional' | 'other';
  stops: number[];
  trips: number[][];
}
export interface Transfer {
  from: number;
  to: number;
  seconds: number;
}
export interface Timetable {
  version: 1;
  window: 'day' | 'night';
  serviceDate: string;
  windowStart: number;
  windowEnd: number;
  feedVersion: string;
  stops: Stop[];
  routes: Route[];
  transfers: Transfer[];
}

export interface PreparedTimetable {
  timetable: Timetable;
  lat: Float64Array;
  lon: Float64Array;
}
export interface Origin {
  lat: number;
  lon: number;
}
export interface TravelTimeResult {
  stopSeconds: Float32Array;
  computedInMs: number;
}
export interface HeatGrid {
  cellSizeM: number;
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  seconds: Float32Array;
}

const WALK_MPS = 1.2;
const BBOX: [number, number, number, number] = [13.05, 52.33, 13.8, 52.7];
const M_PER_DEG_LAT = 111_320;

function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const mLon = M_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dx = (lon2 - lon1) * mLon;
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

export function loadTimetable(json: Timetable): PreparedTimetable {
  const n = json.stops.length;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  json.stops.forEach((s, i) => {
    lat[i] = s.lat;
    lon[i] = s.lon;
  });
  return { timetable: json, lat, lon };
}

export function travelTimes(
  tt: PreparedTimetable,
  origin: Origin,
  opts: { maxInitialWalkSeconds?: number; maxRounds?: number } = {},
): TravelTimeResult {
  const t0 = performance.now();
  const maxWalk = opts.maxInitialWalkSeconds ?? 900;
  const night = tt.timetable.window === 'night';
  // Fake model: walk to a stop, wait, then ride at an average 22 km/h (14 km/h at night).
  const speed = night ? 3.9 : 6.1;
  const wait = night ? 600 : 240;
  const n = tt.lat.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = metersBetween(origin.lat, origin.lon, tt.lat[i], tt.lon[i]);
    const walk = d / WALK_MPS;
    out[i] = walk <= maxWalk ? walk : Math.min(walk, wait + 300 + d / speed);
  }
  return { stopSeconds: out, computedInMs: performance.now() - t0 };
}

export function heatGrid(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  opts: { cellSizeM?: number; maxFinalWalkSeconds?: number } = {},
): HeatGrid {
  const cellSizeM = opts.cellSizeM ?? 250;
  const maxWalkM = (opts.maxFinalWalkSeconds ?? 900) * WALK_MPS;
  const [w, s, e, nth] = BBOX;
  const midLat = (s + nth) / 2;
  const dLat = cellSizeM / M_PER_DEG_LAT;
  const dLon = cellSizeM / (M_PER_DEG_LAT * Math.cos(midLat * (Math.PI / 180)));
  const cols = Math.ceil((e - w) / dLon);
  const rows = Math.ceil((nth - s) / dLat);
  const seconds = new Float32Array(cols * rows).fill(Infinity);
  const reach = Math.ceil(maxWalkM / cellSizeM);
  for (let i = 0; i < tt.lat.length; i++) {
    const base = result.stopSeconds[i];
    if (!Number.isFinite(base)) continue;
    const c0 = Math.floor((tt.lon[i] - w) / dLon);
    const r0 = Math.floor((tt.lat[i] - s) / dLat);
    for (let r = Math.max(0, r0 - reach); r <= Math.min(rows - 1, r0 + reach); r++) {
      for (let c = Math.max(0, c0 - reach); c <= Math.min(cols - 1, c0 + reach); c++) {
        const d = metersBetween(tt.lat[i], tt.lon[i], s + (r + 0.5) * dLat, w + (c + 0.5) * dLon);
        if (d > maxWalkM) continue;
        const v = base + d / WALK_MPS;
        const k = r * cols + c;
        if (v < seconds[k]) seconds[k] = v;
      }
    }
  }
  return { cellSizeM, bbox: [w, s, w + cols * dLon, s + rows * dLat], cols, rows, seconds };
}

export function gridToGeoJSON(grid: HeatGrid, bandSeconds = 300): FeatureCollection<Polygon> {
  const [w, s, e, nth] = grid.bbox;
  const dLon = (e - w) / grid.cols;
  const dLat = (nth - s) / grid.rows;
  const features: FeatureCollection<Polygon>['features'] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const v = grid.seconds[r * grid.cols + c];
      if (!Number.isFinite(v)) continue;
      const x0 = w + c * dLon;
      const y0 = s + r * dLat;
      features.push({
        type: 'Feature',
        properties: { band: Math.floor(v / bandSeconds), seconds: v },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [x0, y0],
              [x0 + dLon, y0],
              [x0 + dLon, y0 + dLat],
              [x0, y0 + dLat],
              [x0, y0],
            ],
          ],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
