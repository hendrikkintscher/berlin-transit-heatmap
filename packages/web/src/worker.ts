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
import type { FromWorker, RouteProps, ToWorker, Window } from './protocol';

/** Raster cell size. 50 m keeps walking detail around stops; ~60 ms per origin in Node. */
const CELL_M = 50;
/** Hops carrying less than this share of the reachable map are left off the route overlay. */
const MIN_ROUTE_SHARE = 0.01;
/** Only lines at least this busy get a name label. */
const MIN_LABEL_SHARE = 0.03;
/** The image has UPSAMPLE x UPSAMPLE pixels per grid cell (25 m pixels). */
const UPSAMPLE = 2;
const LUT = colorLut();
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
    } else if (msg.type === 'compute') {
      const t0 = performance.now();
      const tt = await ensure(msg.window);
      const result = travelTimes(tt, { lat: msg.lat, lon: msg.lon }, { trackLegs: true });
      const grid = heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: true });
      const used = routeUsage(tt, result, grid, { minShare: MIN_ROUTE_SHARE });
      const routes = usageGeoJSON(tt, used);
      const labels = labelLines(tt, used);
      const image = paint(grid);
      const seconds = grid.seconds as Float32Array<ArrayBuffer>;
      ctx.postMessage(
        {
          type: 'result',
          id: msg.id,
          window: msg.window,
          image,
          bbox: grid.bbox,
          grid: { cols: grid.cols, rows: grid.rows, seconds },
          routes,
          labels,
          computedInMs: result.computedInMs,
          totalMs: performance.now() - t0,
        } satisfies FromWorker,
        [image.rgba.buffer, seconds.buffer],
      );
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * Colours the grid into RGBA pixels at UPSAMPLE x its resolution. Travel times
 * are interpolated bilinearly between cell centres before banding, so band
 * edges come out smooth instead of in 50 m steps. The grid's rows are evenly
 * spaced in latitude but the map is Web Mercator, so each image row samples the
 * grid at its own latitude (otherwise the middle would be off by ~100 m).
 */
function paint(grid: HeatGrid) {
  const { cols, rows, seconds } = grid;
  const [, south, , north] = grid.bbox;
  const width = cols * UPSAMPLE;
  const height = rows * UPSAMPLE;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const yN = mercY(north);
  const yS = mercY(south);
  const dLat = (north - south) / rows;
  // Column sample positions are the same on every row.
  const c0 = new Int32Array(width);
  const cf = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = Math.min(cols - 1, Math.max(0, (x + 0.5) / UPSAMPLE - 0.5));
    c0[x] = Math.min(cols - 2, Math.floor(fx));
    cf[x] = fx - c0[x];
  }
  for (let j = 0; j < height; j++) {
    const lat = (Math.atan(Math.sinh(yN - ((j + 0.5) * (yN - yS)) / height)) * 180) / Math.PI;
    const fy = Math.min(rows - 1, Math.max(0, (north - lat) / dLat - 0.5));
    const r0 = Math.min(rows - 2, Math.floor(fy));
    const ry = fy - r0;
    const top = r0 * cols;
    const bot = top + cols;
    let o = j * width * 4;
    for (let x = 0; x < width; x++, o += 4) {
      const c = c0[x];
      const rx = cf[x];
      const a = seconds[top + c];
      const b = seconds[top + c + 1];
      const d = seconds[bot + c];
      const e = seconds[bot + c + 1];
      let v: number;
      if (a < Infinity && b < Infinity && d < Infinity && e < Infinity) {
        v = (a + (b - a) * rx) * (1 - ry) + (d + (e - d) * rx) * ry;
      } else {
        // At the edge of the reachable area: nearest cell, no blending with "unreachable".
        v = ry < 0.5 ? (rx < 0.5 ? a : b) : rx < 0.5 ? d : e;
        if (!(v < Infinity)) continue;
      }
      const k = Math.min(LUT_MAX, Math.round(v)) * 4;
      rgba[o] = LUT[k];
      rgba[o + 1] = LUT[k + 1];
      rgba[o + 2] = LUT[k + 2];
      rgba[o + 3] = 255;
    }
  }
  return { width, height, rgba };
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
