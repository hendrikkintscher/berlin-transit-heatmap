/// <reference lib="webworker" />
import {
  heatGrid,
  loadTimetable,
  routeUsage,
  travelTimes,
  type HeatGrid,
  type PreparedTimetable,
  type Timetable,
} from '@berlin-transit-heatmap/routing';
import type { FeatureCollection, LineString } from 'geojson';
import { colorLut } from './colors';
import { blurSeconds, warpField } from './soften';
import { accessGrid, departuresPerHour, DESERT_THRESHOLDS, stations } from './layers';
import type { FromWorker, RasterLayer, RouteProps, ToWorker, Window } from './protocol';

/** Raster cell size. 50 m keeps walking detail around stops; ~60 ms per origin in Node. */
const CELL_M = 50;
/** Hops carrying less than this share of the reachable map are left off the route overlay. */
const MIN_ROUTE_SHARE = 0.01;
/** Only lines at least this busy get a name label. */
const MIN_LABEL_SHARE = 0.03;
/** The image has UPSAMPLE x UPSAMPLE pixels per grid cell (25 m pixels). */
const UPSAMPLE = 2;
const UPSAMPLE_SHIFT = 1;
/** Softening, in grid cells (50 m) and seconds. Purely visual; the readout uses the raw grid. */
const SOFT = { blurCells: 2, warpCells: 2.5, warpWavelengthCells: 9, featherSeconds: 45 };
const LUT = colorLut(SOFT.featherSeconds);
const LUT_MAX = LUT.length / 4 - 1;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromWorker) => ctx.postMessage(m);
const loading = new Map<Window, Promise<PreparedTimetable>>();
let dataBase = '';

async function fetchTimetable(window: Window): Promise<Timetable> {
  const url = new URL(`timetable-${window}.json`, dataBase);
  const res = await fetch(url);
  if (!res.ok || !res.headers.get('content-type')?.includes('json') || !res.body) {
    throw new Error(`Timetable not available (${res.status} for ${url.pathname})`);
  }
  // Content-Length is the compressed size when the server gzips, so progress is approximate.
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ type: 'progress', window, loaded, total });
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return JSON.parse(new TextDecoder().decode(buf)) as Timetable;
}

function ensure(window: Window): Promise<PreparedTimetable> {
  let p = loading.get(window);
  if (!p) {
    p = fetchTimetable(window).then((json) => {
      const tt = loadTimetable(json);
      post({
        type: 'loaded',
        info: {
          window,
          serviceDate: json.serviceDate,
          feedVersion: json.feedVersion,
          stops: json.stops.length,
        },
      });
      return tt;
    });
    p.catch(() => loading.delete(window));
    loading.set(window, p);
  }
  return p;
}

ctx.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      dataBase = msg.dataBase;
    } else if (msg.type === 'load') {
      // A quiet (background) load that fails is retried when the window is actually needed.
      await (msg.quiet ? ensure(msg.window).catch(() => undefined) : ensure(msg.window));
    } else if (msg.type === 'layers') {
      const tt = await ensure(msg.window);
      const perHour = departuresPerHour(tt);
      const desert = paintDesert(accessGrid(tt, perHour), DESERT_THRESHOLDS[msg.window]);
      ctx.postMessage(
        {
          type: 'layers',
          window: msg.window,
          stations: stations(tt, perHour),
          desert,
        } satisfies FromWorker,
        [desert.image.rgba.buffer, desert.grid.seconds.buffer],
      );
    } else if (msg.type === 'compute') {
      const t0 = performance.now();
      const tt = await ensure(msg.window);
      const starts = [{ lat: msg.lat, lon: msg.lon }, ...(msg.second ? [msg.second] : [])];
      const runs = starts.map((o) => {
        const result = travelTimes(tt, o, { trackLegs: true });
        const grid = heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: true });
        return { result, grid, used: routeUsage(tt, result, grid, { minShare: MIN_ROUTE_SHARE }) };
      });
      const grid = runs.length === 1 ? runs[0].grid : slowerOf(runs[0].grid, runs[1].grid);
      const used = runs.flatMap((r) => r.used);
      const routes = usageGeoJSON(tt, used);
      const labels = labelLines(tt, used);
      const image = paint(grid);
      const seconds = grid.seconds as Float32Array<ArrayBuffer>;
      const each =
        runs.length === 2
          ? (runs.map((r) => r.grid.seconds) as [
              Float32Array<ArrayBuffer>,
              Float32Array<ArrayBuffer>,
            ])
          : undefined;
      ctx.postMessage(
        {
          type: 'result',
          id: msg.id,
          window: msg.window,
          image,
          bbox: grid.bbox,
          grid: { cols: grid.cols, rows: grid.rows, seconds },
          each,
          routes,
          labels,
          computedInMs: runs.reduce((a, r) => a + r.result.computedInMs, 0),
          totalMs: performance.now() - t0,
        } satisfies FromWorker,
        [image.rgba.buffer, seconds.buffer, ...(each ? each.map((e) => e.buffer) : [])],
      );
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

/** Meeting point: each cell gets the slower of the two trips ("where can we both be in N min?"). */
function slowerOf(a: HeatGrid, b: HeatGrid): HeatGrid {
  const seconds = new Float32Array(a.seconds.length);
  for (let i = 0; i < seconds.length; i++) seconds[i] = Math.max(a.seconds[i], b.seconds[i]);
  return { ...a, seconds, stop: undefined };
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * Colours the grid into RGBA pixels at UPSAMPLE x its resolution. For looks the
 * travel times are blurred a little, sampled at a gently wobbled position (so the
 * walking circles around stops become organic shapes) and interpolated
 * bilinearly between cells; band edges are feathered in the colour table. The
 * grid's rows are evenly spaced in latitude but the map is Web Mercator, so each
 * image row samples the grid at its own latitude.
 */
function paint(grid: HeatGrid) {
  const { cols, rows } = grid;
  const seconds = blurSeconds(grid.seconds, cols, rows, SOFT.blurCells);
  const [, south, , north] = grid.bbox;
  const width = cols * UPSAMPLE;
  const height = rows * UPSAMPLE;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const yN = mercY(north);
  const yS = mercY(south);
  const dLat = (north - south) / rows;
  const warp = warpOf(cols, rows);
  for (let j = 0; j < height; j++) {
    const lat = (Math.atan(Math.sinh(yN - ((j + 0.5) * (yN - yS)) / height)) * 180) / Math.PI;
    const fy0 = (north - lat) / dLat - 0.5;
    const wRow = Math.min(rows - 1, Math.max(0, Math.round(fy0))) * cols;
    let o = j * width * 4;
    for (let x = 0; x < width; x++, o += 4) {
      const fx0 = (x + 0.5) / UPSAMPLE - 0.5;
      const w = wRow + (x >> UPSAMPLE_SHIFT);
      let fx = fx0 + warp.dx[w];
      let fy = fy0 + warp.dy[w];
      fx = fx < 0 ? 0 : fx > cols - 1 ? cols - 1 : fx;
      fy = fy < 0 ? 0 : fy > rows - 1 ? rows - 1 : fy;
      let c = fx | 0;
      let r0 = fy | 0;
      if (c > cols - 2) c = cols - 2;
      if (r0 > rows - 2) r0 = rows - 2;
      const rx = fx - c;
      const ry = fy - r0;
      const top = r0 * cols + c;
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
        if (!(v < Infinity)) continue;
      }
      const k = (v >= LUT_MAX ? LUT_MAX : (v + 0.5) | 0) * 4;
      rgba[o] = LUT[k];
      rgba[o + 1] = LUT[k + 1];
      rgba[o + 2] = LUT[k + 2];
      rgba[o + 3] = 255;
    }
  }
  return { width, height, rgba };
}

/** Desert shading: one dark tint, stronger past the second threshold, edges feathered. */
const DESERT_RGB = [36, 22, 64];
const DESERT_ALPHA = [0, 0.36, 0.64];
const DESERT_FEATHER_S = 60;
/** Unreachable cells (no stop within the walking limit) blend as this many seconds. */
const DESERT_FAR_S = 3600;

function paintDesert(grid: HeatGrid, [light, strong]: readonly [number, number]): RasterLayer {
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

let warpCache: { key: string; field: ReturnType<typeof warpField> } | null = null;
/** The wobble pattern depends only on the grid size, so it is built once. */
function warpOf(cols: number, rows: number) {
  const key = `${cols}x${rows}`;
  if (warpCache?.key !== key) {
    warpCache = { key, field: warpField(cols, rows, SOFT.warpCells, SOFT.warpWavelengthCells) };
  }
  return warpCache.field;
}

type Segments = ReturnType<typeof routeUsage>;
const lineName = (s: Segments[number]) => s.names.slice(0, 4).join('/');

function usageGeoJSON(
  tt: PreparedTimetable,
  segments: Segments,
): FeatureCollection<LineString, RouteProps> {
  return {
    type: 'FeatureCollection',
    // Lightest first so heavy lines draw on top.
    features: [...segments].reverse().map((s) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [tt.stopLon[s.a], tt.stopLat[s.a]],
          [tt.stopLon[s.b], tt.stopLat[s.b]],
        ],
      },
      properties: { share: s.share, mode: s.mode, names: lineName(s) },
    })),
  };
}

/**
 * Chains hops that carry the same line names into polylines, so each line gets a
 * few spaced labels instead of one per stop-to-stop hop.
 */
function labelLines(
  tt: PreparedTimetable,
  segments: Segments,
): FeatureCollection<LineString, { names: string }> {
  const groups = new Map<string, Segments>();
  for (const s of segments) {
    if (s.share < MIN_LABEL_SHARE) continue;
    const name = lineName(s);
    groups.set(name, [...(groups.get(name) ?? []), s]);
  }
  const features: FeatureCollection<LineString, { names: string }>['features'] = [];
  for (const [names, segs] of groups) {
    const adj = new Map<number, number[]>();
    for (const s of segs) {
      adj.set(s.a, [...(adj.get(s.a) ?? []), s.b]);
      adj.set(s.b, [...(adj.get(s.b) ?? []), s.a]);
    }
    const used = new Set<string>();
    const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    const walk = (start: number, next: number) => {
      const path = [start];
      let prev = start;
      let cur = next;
      for (;;) {
        used.add(key(prev, cur));
        path.push(cur);
        const nbrs = adj.get(cur)!;
        if (nbrs.length !== 2) break;
        const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0];
        if (used.has(key(cur, nxt))) break;
        prev = cur;
        cur = nxt;
      }
      return path;
    };
    // Start at ends and junctions first, then whatever is left (loops).
    const starts = [...adj.keys()].sort(
      (x, y) => Number(adj.get(x)!.length === 2) - Number(adj.get(y)!.length === 2),
    );
    for (const a of starts) {
      for (const b of adj.get(a)!) {
        if (used.has(key(a, b))) continue;
        const path = walk(a, b);
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: path.map((s) => [tt.stopLon[s], tt.stopLat[s]]),
          },
          properties: { names },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
