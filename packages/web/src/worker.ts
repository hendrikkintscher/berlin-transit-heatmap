/// <reference lib="webworker" />
import {
  gridToGeoJSON,
  heatGrid,
  loadTimetable,
  travelTimes,
  type PreparedTimetable,
  type Timetable,
} from '@berlin-transit-heatmap/routing';
import type { FromWorker, ToWorker, Window } from './protocol';

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
      await ensure(msg.window);
    } else if (msg.type === 'compute') {
      const t0 = performance.now();
      const tt = await ensure(msg.window);
      const result = travelTimes(tt, { lat: msg.lat, lon: msg.lon });
      const grid = heatGrid(tt, result);
      const geojson = gridToGeoJSON(grid);
      post({
        type: 'result',
        id: msg.id,
        window: msg.window,
        geojson,
        computedInMs: result.computedInMs,
        totalMs: performance.now() - t0,
      });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
