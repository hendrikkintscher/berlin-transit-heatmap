// Timetables in the worker: downloads (with progress, a typical day standing in for a
// missing date), the stop list shared by every hour, and the prepared forward, reversed
// and filtered timetables kept in memory.
import {
  bikeTimetable,
  decodeStopList,
  decodeTimetable,
  loadTimetable,
  needsStopList,
  reverseTimetable,
  stepFreeTimetable,
  type PreparedTimetable,
  type StopListData,
  type Timetable,
} from '@berlin-transit-heatmap/routing';
import { dataPublished, dataUrl } from './data-url';
import type { Direction, Window } from './protocol';
import { typicalWindow } from './when';
import { post } from './worker-post';

/** Where the region's data files are (data/<region>/), from the app's first message. */
export let dataBase = '';
export function setDataBase(base: string) {
  dataBase = base;
}
const loading = new Map<Window, Promise<PreparedTimetable>>();

async function fetchTimetable(window: Window, file: string = window): Promise<Timetable> {
  const typical = typicalWindow(file);
  try {
    return await downloadTimetable(window, file, typical);
  } catch (err) {
    // Offline, or the download broke off: a date's typical day (often kept by the service
    // worker) stands in, and the map says so as for a day without its own file.
    if (typical) return fetchTimetable(window, typical);
    throw err;
  }
}

async function downloadTimetable(
  window: Window,
  file: string,
  typical: string | null,
): Promise<Timetable> {
  // The hour's file and, the first time, the stop list come down side by side; the bar
  // counts both.
  const list = stopList();
  const url = dataUrl(dataBase, `timetable-${file}.bin`);
  const res = await fetch(url);
  // (Some servers answer a missing file with the app's own page.)
  const binary = res.ok && res.body !== null && !res.headers.get('content-type')?.includes('html');
  // A date has only the binary file; without one (the evening before today, or a day the
  // build has not reached yet) its typical day stands in, and says so by its serviceDate.
  if (!binary) void res.body?.cancel();
  if (!binary && typical) return downloadTimetable(window, typical, null);
  if (!binary) throw new Error(`Timetable not available (${res.status} for ${url.pathname})`);
  let hour = { loaded: 0, total: 0 };
  const report = () => {
    const l = list?.done === false ? list : { loaded: 0, total: 0 };
    post({ type: 'progress', window, loaded: hour.loaded + l.loaded, total: hour.total + l.total });
  };
  list?.listeners.add(report);
  try {
    const buf = await readWithProgress(res.body, res, (loaded, total) => {
      hour = { loaded, total };
      report();
    });
    if (!needsStopList(buf)) return decodeTimetable(buf) as Timetable;
    if (!list) throw new Error('Timetable needs a stop list, and this deploy has none');
    return decodeTimetable(buf, await list.data) as Timetable;
  } finally {
    list?.listeners.delete(report);
  }
}

/** The stop list's download: its data, how far it is, and who wants to hear about it. */
interface StopListLoad {
  data: Promise<StopListData>;
  loaded: number;
  total: number;
  done: boolean;
  listeners: Set<() => void>;
}
let stopListLoad: StopListLoad | null = null;

/**
 * The build's stops and footpaths (stoplist.bin): downloaded and read once, then shared by
 * every hour's timetable; tried again after a failure. Null when the deploy's data has no
 * stop list (built before it was split out: its timetables are whole).
 */
function stopList(): StopListLoad | null {
  if (stopListLoad) return stopListLoad;
  if (!dataPublished('stoplist.bin')) return null;
  const progress = { loaded: 0, total: 0, done: false, listeners: new Set<() => void>() };
  const data = (async () => {
    const url = dataUrl(dataBase, 'stoplist.bin');
    const res = await fetch(url);
    if (!res.ok || res.body === null || res.headers.get('content-type')?.includes('html')) {
      void res.body?.cancel();
      throw new Error(`Stop list not available (${res.status} for ${url.pathname})`);
    }
    const buf = await readWithProgress(res.body, res, (loaded, total) => {
      progress.loaded = loaded;
      progress.total = total;
      for (const f of progress.listeners) f();
    });
    progress.done = true;
    return decodeStopList(buf);
  })();
  const load: StopListLoad = Object.assign(progress, { data });
  data.catch(() => {
    load.done = true;
    if (stopListLoad === load) stopListLoad = null;
  });
  stopListLoad = load;
  return load;
}

/**
 * A download's bytes, reporting how many have arrived. Content-Length is the compressed
 * size when the server gzips, so the progress is approximate.
 */
export async function readWithProgress(
  body: ReadableStream<Uint8Array>,
  res: Response,
  report: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    report(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return buf;
}

/**
 * Prepared timetables kept in memory (about 3.5 MB each); older ones are dropped and
 * prepared again if needed. Five, so the current and next hour, a comparison and a
 * step-free toggle don't push each other out.
 */
const KEEP_LOADED = 5;

/** The parsed file, shared by the forward and reversed timetables; a few kept. */
function rawTimetable(window: Window): Promise<Timetable> {
  let p = raws.get(window);
  if (p) {
    raws.delete(window);
  } else {
    p = fetchTimetable(window);
    p.catch(() => raws.delete(window));
  }
  raws.set(window, p);
  // Parsed files are large; keep only the latest (the browser cache has the rest).
  while (raws.size > 1) raws.delete(raws.keys().next().value!);
  return p;
}

/** Filtered timetables: step-free, and without the lines that do not take bikes. */
export interface Variant {
  stepFree?: boolean;
  bike?: boolean;
}
const variantKey = (window: Window, v: Variant) =>
  window + (v.stepFree ? '|step-free' : '') + (v.bike ? '|bike' : '');
function filtered(json: Timetable, v: Variant): Timetable {
  const sf = v.stepFree ? stepFreeTimetable(json) : json;
  return v.bike ? bikeTimetable(sf) : sf;
}

export function ensure(window: Window, variant: Variant = {}): Promise<PreparedTimetable> {
  const key = variantKey(window, variant);
  let p = loading.get(key);
  if (p) {
    // Most recently used last.
    loading.delete(key);
    loading.set(key, p);
  } else {
    const raw = rawTimetable(window);
    p = raw.then((json) => {
      const tt = loadTimetable(filtered(json, variant));
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
    p.catch(() => loading.delete(key));
    loading.set(key, p);
    while (loading.size > KEEP_LOADED) loading.delete(loading.keys().next().value!);
  }
  return p;
}

/** Reversed timetables for "arrive by", kept alongside the forward ones. */
/** Keyed like the forward ones (variantKey). */
const reversed = new Map<string, Promise<PreparedTimetable>>();
const raws = new Map<Window, Promise<Timetable>>();

/**
 * The prepared timetable for a direction. Arriving uses the file of the hour before
 * and asks for arrivals in the hour after its window, run on the time-reversed timetable.
 */
export async function prepared(
  window: Window,
  direction: Direction,
  variant: Variant = {},
): Promise<PreparedTimetable> {
  if (direction === 'depart') return ensure(window, variant);
  const key = variantKey(window, variant);
  let p = reversed.get(key);
  if (!p) {
    p = rawTimetable(window).then((json) =>
      loadTimetable(
        reverseTimetable(filtered(json, variant), json.windowEnd, json.windowEnd + 3600),
      ),
    );
    p.catch(() => reversed.delete(key));
    reversed.set(key, p);
    while (reversed.size > KEEP_LOADED) reversed.delete(reversed.keys().next().value!);
  }
  return p;
}
