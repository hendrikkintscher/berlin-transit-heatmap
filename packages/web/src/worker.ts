/// <reference lib="webworker" />
import {
  BIKE_ONLY_MAX_SECONDS,
  BIKE_SPEED_MPS,
  BIKE_STATION_SECONDS,
  bikeTimetable,
  decodeLines,
  decodeTimetable,
  hopCourse,
  gridLayout,
  distanceM,
  heatGrid,
  departureAt,
  journeyTo,
  NETWORK_WALK_SPEED_MPS,
  walkPath,
  loadTimetable,
  loadWalkNetwork,
  snapCellsInSteps,
  reverseTimetable,
  routeUsage,
  stepFreeTimetable,
  travelTimes,
  type HeatGrid,
  type Journey,
  type LineShapes,
  type Origin,
  type PreparedTimetable,
  type Timetable,
  type TravelTimeResult,
  type UsedSegment,
  type WalkNetwork,
  REGION,
} from '@berlin-transit-heatmap/routing';
import type { FeatureCollection, LineString } from 'geojson';
import {
  colorLut,
  DIFF_MAX_S,
  DIFF_MIN_S,
  diffLut,
  homeLut,
  HOME_OUTLINE_MINUTES,
  limitLut,
  LIMIT_FEATHER_S,
} from './colors';
import { blurSeconds, warpField } from './soften';
import { outlines as traceOutlines } from './contours';
import { accessGrid, departuresPerHour, stations } from './layers';
import { scoreGrid } from './favourites';
import { suggestMeetingPoints, type MeetCandidate } from './meet';
import { earlyLoad } from './early';
import { typicalWindow } from './when';
import type {
  Direction,
  FromWorker,
  RasterLayer,
  RouteProps,
  ToWorker,
  Travel,
  TripLeg,
  Window,
} from './protocol';

/** Raster cell size. 50 m keeps walking detail around stops; ~60 ms per origin in Node. */
const CELL_M = 50;
/** Hops carrying less than this share of the reachable map are left off the route overlay. */
const MIN_ROUTE_SHARE = 0.01;
/** Only lines at least this busy get a name label. */
const MIN_LABEL_SHARE = 0.03;
/**
 * The image has UPSAMPLE x UPSAMPLE pixels per grid cell. One 50 m pixel per cell looks the
 * same as 25 m ones once MapLibre resamples it linearly, at a quarter of the painting.
 */
const UPSAMPLE = 1;
const UPSAMPLE_SHIFT = 0;
/** Blur for the isochrone outlines, in grid cells (50 m). */
const OUTLINE_BLUR_CELLS = 6;
/** Softening, in grid cells (50 m) and seconds. Purely visual; the readout uses the raw grid. */
const SOFT = { blurCells: 2, warpCells: 2.5, warpWavelengthCells: 9, featherSeconds: 45 };
const LUT = colorLut(SOFT.featherSeconds);
const DIFF_LUT = diffLut();
const HOME_LUT = homeLut();
const LIMIT_LUTS = new Map<number, Uint8Array>();
/** The colour image of the last map: its travel times, or "Bis N Min." in one colour. */
function paintShown(shown: NonNullable<typeof lastShown>, limit?: number) {
  if (!limit) return paint(shown.grid, shown.values);
  let lut = LIMIT_LUTS.get(limit);
  if (!lut) LIMIT_LUTS.set(limit, (lut = limitLut(limit)));
  // A meeting point counts everyone's own minutes (the slowest), not the extra ones. Only
  // the area within reach is painted, so fewer minutes paint faster.
  const { grid } = shown;
  const win = windowUpTo(grid.seconds, grid.cols, grid.rows, limit * 60 + LIMIT_FEATHER_S);
  if (!win) return { width: 1, height: 1, rgba: new Uint8ClampedArray(4) };
  return paint(grid, grid.seconds, lut, 0, win);
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromWorker) => ctx.postMessage(m);
const loading = new Map<Window, Promise<PreparedTimetable>>();
let dataBase = '';

async function fetchTimetable(window: Window, file: string = window): Promise<Timetable> {
  const url = new URL(`timetable-${file}.bin`, dataBase);
  const res = await fetch(url);
  // (Some servers answer a missing file with the app's own page.)
  const binary = res.ok && res.body !== null && !res.headers.get('content-type')?.includes('html');
  // A date has only the binary file; without one (the evening before today, or a day the
  // build has not reached yet) its typical day stands in, and says so by its serviceDate.
  const typical = typicalWindow(file);
  if (!binary && typical) return fetchTimetable(window, typical);
  if (!binary) throw new Error(`Timetable not available (${res.status} for ${url.pathname})`);
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
  return decodeTimetable(buf) as Timetable;
}

/**
 * The footpath network, fetched in the background when the UI asks (once the first map
 * is on screen), so the first map never shares the connection with it. Until it is ready,
 * walks are straight lines; the UI recomputes the map when it arrives. Its download
 * reports progress, and the grid snapping runs in steps, so taps in the meantime are
 * answered.
 */
let walk: WalkNetwork | undefined;
let walkStarted = false;
/** Walking speed from the menu, set by each compute and layers request. */
let walkSpeedMps: number | undefined;

async function loadWalk(): Promise<void> {
  if (walkStarted) return;
  walkStarted = true;
  try {
    const res = await fetch(new URL('walk.bin', dataBase));
    if (!res.ok || !res.body) throw new Error(`walk.bin: ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      post({ type: 'walkProgress', loaded, total });
    }
    const buf = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    const net = loadWalkNetwork(buf);
    // Snapping the map grid to the network takes a moment; do it now rather than on a
    // tap, a slice at a time with pauses for any messages that queued up.
    const layout = gridLayout({ cellSizeM: CELL_M });
    const steps = snapCellsInSteps(net, layout.bbox, layout.cols, layout.rows);
    while (!steps.next().done) await new Promise((r) => setTimeout(r, 0));
    walk = net;
    post({ type: 'walk' });
  } catch (err) {
    // Straight-line walking stays in place.
    console.warn('Walking network not used:', err);
    post({ type: 'walkFailed' });
  }
}

/**
 * The hops' courses along tracks and roads (lines.bin), fetched once the first map is
 * out; until then, and for hops it does not cover, lines run straight from stop to stop.
 */
let lineShapes: LineShapes | null = null;
let linesStarted = false;
/** The last map's lines, redrawn along their courses when lines.bin arrives. */
let lastRoutes: { id: number; tt: PreparedTimetable; used: Segments } | null = null;

async function loadLines(tt: PreparedTimetable): Promise<void> {
  if (linesStarted) return;
  linesStarted = true;
  try {
    const res = await fetch(new URL('lines.bin', dataBase));
    if (!res.ok) return;
    lineShapes = decodeLines(await res.arrayBuffer(), tt.stopCount, (s) => [
      tt.stopLon[s]!,
      tt.stopLat[s]!,
    ]);
    const last = lastRoutes;
    if (last)
      post({
        type: 'routes',
        id: last.id,
        routes: usageGeoJSON(last.tt, last.used),
        labels: labelLines(last.tt, last.used),
      });
  } catch (err) {
    console.warn('Line courses not used:', err);
  }
}

/** [lon, lat] points from stop to stop along the hops' courses. */
function course(tt: PreparedTimetable, stops: number[]): [number, number][] {
  const pos = (s: number): [number, number] => [tt.stopLon[s]!, tt.stopLat[s]!];
  if (stops.length < 2) return stops.map(pos);
  const out: [number, number][] = [pos(stops[0]!)];
  for (let i = 1; i < stops.length; i++)
    out.push(...hopCourse(lineShapes, stops[i - 1]!, stops[i]!, pos).slice(1));
  return out;
}

/** Prepared timetables kept in memory; older hours are dropped and fetched again if needed. */
const KEEP_LOADED = 3;

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
interface Variant {
  stepFree?: boolean;
  bike?: boolean;
}
const variantKey = (window: Window, v: Variant) =>
  window + (v.stepFree ? '|step-free' : '') + (v.bike ? '|bike' : '');
function filtered(json: Timetable, v: Variant): Timetable {
  const sf = v.stepFree ? stepFreeTimetable(json) : json;
  return v.bike ? bikeTimetable(sf) : sf;
}

function ensure(window: Window, variant: Variant = {}): Promise<PreparedTimetable> {
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
async function prepared(
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

/**
 * The newest map and trip asked for. A request that a newer one has replaced is dropped
 * (the app shows only the newest): checked once the messages queued behind it are in, and
 * again after a timetable had to be loaded.
 */
let latestCompute = 0;
let latestTrip = 0;
/**
 * Lets the messages queued meanwhile in, so their ids are known: a message to itself is
 * queued behind them (a timer can run ahead of them).
 */
const tick = new MessageChannel();
const ticks: (() => void)[] = [];
tick.port1.onmessage = () => ticks.shift()?.();
const nextTask = () =>
  new Promise<void>((r) => {
    ticks.push(r);
    tick.port2.postMessage(0);
  });

ctx.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      dataBase = msg.dataBase;
    } else if (msg.type === 'boot') {
      // From the start page, before the app's code is in: the first map's timetable, prepared
      // as that map will need it.
      dataBase = new URL(`data/${REGION.id}/`, msg.baseURI).href;
      const first = earlyLoad(msg.search, msg);
      await prepared(first.window, first.direction, {
        stepFree: first.stepFree,
        bike: first.bike,
      });
    } else if (msg.type === 'load') {
      // A quiet (background) load that fails is retried when the window is actually needed.
      const variant = { stepFree: msg.stepFree, bike: msg.bike };
      const p = prepared(msg.window, msg.direction ?? 'depart', variant);
      await (msg.quiet ? p.catch(() => undefined) : p);
    } else if (msg.type === 'loadWalk') {
      void loadWalk();
    } else if (msg.type === 'stations') {
      const tt = await ensure(msg.window);
      const list = stations(tt, departuresPerHour(tt)).features.map((f) => ({
        name: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        lines: f.properties.lines,
        perHour: f.properties.perHour,
      }));
      post({ type: 'stations', list });
    } else if (msg.type === 'layers') {
      walkSpeedMps = msg.walkKmh / 3.6;
      const tt = await ensure(msg.window);
      const perHour = departuresPerHour(tt);
      const desert = paintDesert(accessGrid(tt, perHour, walk, walkSpeedMps), msg.thresholds);
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
      latestCompute = msg.id;
      await nextTask();
      if (msg.id !== latestCompute) return;
      livingId = 0; // a running "where can I live?" map is no longer wanted
      const t0 = performance.now();
      walkSpeedMps = msg.walkKmh / 3.6;
      const travel = msg.travel ?? 'walk';
      const variant = { stepFree: msg.stepFree, bike: travel === 'bike' };
      const tt = await prepared(msg.window, msg.direction, variant);
      if (msg.id !== latestCompute) return;
      const starts = [{ lat: msg.lat, lon: msg.lon }, ...(msg.others ?? [])];
      const meeting = starts.length > 1;
      const typical = msg.measure === 'typical';
      // Next connection: plain RAPTOR from one moment (reversed files count backwards).
      const now = (t: PreparedTimetable) =>
        msg.direction === 'depart'
          ? t.windowStart + (msg.leaveOffset ?? 0)
          : // Reversed files count backwards: later arrivals are further below windowEnd.
            t.windowEnd - (msg.arriveOffset ?? 0);
      const leaveAt = (t: PreparedTimetable) => (msg.measure === 'next' ? now(t) : undefined);
      const runs = starts.map((o) => run(tt, o, typical, travel, true, leaveAt(tt)));
      const grid = slowestOf(runs.map((r) => r.shown));
      const used = runs.flatMap((r) => r.used);
      const routes = usageGeoJSON(tt, used);
      lastRoutes = { id: msg.id, tt, used };
      const labels = labelLines(tt, used);
      lastTrip = {
        tt,
        runs,
        direction: msg.direction,
        travel,
        // Trips on tap leave now (or, arriving, arrive by the end of the hour): the map's
        // own pass for "Nächste", a pass of their own for Typisch and Bestfall.
        leaveAt: msg.measure === 'next' ? null : now(tt),
        from: now(tt),
      };

      let image: ReturnType<typeof paint>;
      let outlines: ReturnType<typeof traceOutlines>;
      let compare: Float32Array<ArrayBuffer> | undefined;
      let extraBase: number | undefined;
      lastShown = null;
      let unpainted = false;
      if (msg.compare) {
        const tt2 = await prepared(msg.compare, msg.direction, variant);
        if (msg.id !== latestCompute) return;
        const other = starts.map((o) => run(tt2, o, typical, travel, false, leaveAt(tt2)).shown);
        const g2 = slowestOf(other);
        compare = g2.seconds as Float32Array<ArrayBuffer>;
        image = paintDiff(grid, g2);
        outlines = { type: 'FeatureCollection', features: [] };
      } else {
        // Meeting point: colour the extra minutes over the best spot, so it is always green.
        extraBase = meeting ? minFinite(grid.seconds) : 0;
        const shownSeconds = extraBase ? grid.seconds.map((v) => v - extraBase!) : grid.seconds;
        lastShown = { id: msg.id, grid, values: shownSeconds };
        if (msg.noImage && !msg.limit) {
          // Heatmap off: the outlines come first; the colours wait for a 'paint'.
          image = { width: 1, height: 1, rgba: new Uint8ClampedArray(4) };
          unpainted = true;
        } else image = paintShown(lastShown, msg.limit);
        // Outlines follow a more strongly blurred field, so walk bubbles round off.
        outlines = traceOutlines(shownSeconds, grid.cols, grid.rows, grid.bbox, OUTLINE_BLUR_CELLS);
      }
      // The grids stay here for trip lookups, so the UI gets copies.
      const seconds = Float32Array.from(grid.seconds) as Float32Array<ArrayBuffer>;
      const each = meeting
        ? runs.map((r) => Float32Array.from(r.shown.seconds) as Float32Array<ArrayBuffer>)
        : undefined;
      // Meeting point: a few stations everyone reaches quickly, from each start's own times.
      const candidates = meeting ? meetCandidates(tt) : [];
      const meet = meeting
        ? suggestMeetingPoints(candidates, (i) =>
            runs.map((r) => cellSeconds(r.shown, candidates[i])),
          )
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
          meet,
          ...(meeting && extraBase !== undefined ? { extraBase } : {}),
          compare,
          routes,
          labels,
          outlines,
          computedInMs: runs.reduce((a, r) => a + r.result.computedInMs, 0),
          totalMs: performance.now() - t0,
          ...(unpainted ? { unpainted: true as const } : {}),
          ...(msg.limit && !msg.compare ? { limit: msg.limit } : {}),
        } satisfies FromWorker,
        [
          image.rgba.buffer,
          seconds.buffer,
          ...(each ? each.map((e) => e.buffer) : []),
          ...(compare ? [compare.buffer] : []),
        ],
      );
      // The lines' courses come after the first map, never before it.
      void loadLines(tt);
    } else if (msg.type === 'paint') {
      if (lastShown?.id !== msg.id) return;
      const image = paintShown(lastShown, msg.limit);
      ctx.postMessage(
        {
          type: 'image',
          id: msg.id,
          image,
          ...(msg.limit ? { limit: msg.limit } : {}),
        } satisfies FromWorker,
        [image.rgba.buffer],
      );
    } else if (msg.type === 'living') {
      await living(msg);
    } else if (msg.type === 'home') {
      await home(msg);
    } else if (msg.type === 'homeTrip') {
      const journey = await homeTrip(msg);
      post({ type: 'trip', id: msg.id, ...tripMessage([journey]) });
    } else if (msg.type === 'livingAt') {
      const l = livings.get(msg.map);
      const minutes = (l?.seconds ?? []).map((g) => {
        const v = cellSeconds({ ...l!.layout, seconds: g }, msg);
        return v < Infinity ? Math.round(v / 60) : null;
      });
      post({ type: 'livingAt', id: msg.id, minutes });
    } else if (msg.type === 'trip') {
      latestTrip = msg.id;
      await nextTask();
      if (msg.id !== latestTrip) return;
      const last = lastTrip;
      // A later moment (the shown connection was missed): a pass of its own from then.
      const later =
        last &&
        msg.leaveAt !== undefined &&
        last.direction === 'depart' &&
        last.travel !== 'bikeonly'
          ? { ...last, leaveAt: msg.leaveAt, from: msg.leaveAt }
          : null;
      const journeys = (last?.runs ?? []).map((r) =>
        later ? trip(later, laterRun(later, r, msg), msg) : trip(last!, nowRun(last!, r, msg), msg),
      );
      post({ type: 'trip', id: msg.id, ...tripMessage(journeys) });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

// ---------- "Bis wann komme ich heim?" ----------
/** Deadlines step through each file this far apart, from 2 h after its start. */
const HOME_STEP_S = 900;
/** A connection counts as fast while it takes at most this much longer than in the evening. */
const HOME_SLACK_S = 1200;
/** Trips longer than this (waiting at home included) do not count as getting home. */
const HOME_MAX_S = 7200;

/** Seconds after midnight of the evening a file's hour starts at (1 Uhr = 25 h). */
const eveningSeconds = (window: Window) => {
  const h = Number(window.slice(-2));
  return (h < 12 ? h + 24 : h) * 3600;
};

/** The last home map: what a tap needs to rebuild its last fast connection. */
/** The last map's grid and the times its colours show, for painting it again ('paint'). */
let lastShown: { id: number; grid: HeatGrid; values: Float32Array } | null = null;

let lastHome: {
  id: number;
  origin: { lat: number; lon: number };
  travel: Travel;
  variant: Variant;
  /** Per pass: its file and deadline (reversed time). */
  passes: { window: Window; leaveAt: number }[];
  /** Per stop: the pass its last fast connection came from. */
  fastPass: Uint8Array;
  grid: HeatGrid;
} | null = null;

/**
 * Per stop, the latest departure that still gets home (any) and the latest whose trip is at
 * most HOME_SLACK_S longer than in the evening (fast; after it the night network takes
 * over). Each pass is an arrive-by RAPTOR from home: a deadline D gives every stop's latest
 * departure L = D - seconds. File h serves deadlines from h+2:15 to h+3, which its trips
 * (departing up to 3 h after its start) cover for journeys leaving after h.
 */
async function home(msg: Extract<ToWorker, { type: 'home' }>) {
  const t0 = performance.now();
  livingId = msg.id;
  walkSpeedMps = msg.walkKmh / 3.6;
  const travel = msg.travel ?? 'walk';
  const variant = { stepFree: msg.stepFree, bike: travel === 'bike' };
  const w = travelOptions(travel);
  const origin = { lat: msg.lat, lon: msg.lon };
  const passes: { window: Window; leaveAt: number }[] = [];
  let fast: Float64Array | null = null;
  let any: Float64Array | null = null;
  let base: Float64Array | null = null;
  let fastPass: Uint8Array | null = null;
  let tt: PreparedTimetable | null = null;
  let computedInMs = 0;
  const steps = 3600 / HOME_STEP_S;
  for (const [f, window] of msg.windows.entries()) {
    tt = await prepared(window, 'arrive', variant);
    const S = tt.stopCount;
    fast ??= new Float64Array(S).fill(-Infinity);
    any ??= new Float64Array(S).fill(-Infinity);
    base ??= new Float64Array(S).fill(Infinity);
    fastPass ??= new Uint8Array(S);
    const start = eveningSeconds(window);
    // The reversed file counts backwards from its end: its windowEnd is -(file end).
    const fileEnd = -tt.windowEnd;
    for (let q = 1; q <= steps; q++) {
      const after = 3600 + q * HOME_STEP_S; // deadline, seconds after the file's end
      const leaveAt = -(fileEnd + after);
      const r = travelTimes(tt, origin, { leaveAt, ...w });
      computedInMs += r.computedInMs;
      passes.push({ window, leaveAt });
      const deadline = start + 3600 + after;
      for (let s = 0; s < S; s++) {
        const secs = r.stopSeconds[s];
        if (!(secs <= HOME_MAX_S)) continue;
        const L = deadline - secs;
        if (f === 0) base[s] = Math.min(base[s], secs);
        if (L > any[s]) any[s] = L;
        if (secs <= base[s] + HOME_SLACK_S && L > fast[s]) {
          fast[s] = L;
          fastPass[s] = passes.length - 1;
        }
      }
    }
    post({ type: 'mapProgress', id: msg.id, done: f + 1, total: msg.windows.length });
    await new Promise((r) => setTimeout(r, 0));
    if (livingId !== msg.id) return;
  }
  if (!tt || !fast || !any || !fastPass) return;
  // On the grid: the latest departure from a place is its stops' minus the walk there,
  // so rasterise end - L (smallest wins) with the walk added; next to home, walking wins.
  const end = eveningSeconds(msg.windows[msg.windows.length - 1]) + 3 * 3600;
  const toGrid = (L: Float64Array, trackStops: boolean) =>
    heatGrid(
      tt!,
      {
        stopSeconds: Float32Array.from(L, (v) => (v > -Infinity ? end - v : Infinity)),
        origin,
        computedInMs: 0,
      } as TravelTimeResult,
      { cellSizeM: CELL_M, trackStops, ...w },
    );
  const grid = toGrid(fast, true);
  const anyGrid = toGrid(any, false);
  lastHome = { id: msg.id, origin, travel, variant, passes, fastPass, grid };
  const image = paint(grid, undefined, HOME_LUT);
  const outlines = traceOutlines(
    grid.seconds,
    grid.cols,
    grid.rows,
    grid.bbox,
    OUTLINE_BLUR_CELLS,
    HOME_OUTLINE_MINUTES,
  );
  const empty = { type: 'FeatureCollection' as const, features: [] };
  const values = Float32Array.from(grid.seconds) as Float32Array<ArrayBuffer>;
  const anyValues = anyGrid.seconds as Float32Array<ArrayBuffer>;
  ctx.postMessage(
    {
      type: 'result',
      id: msg.id,
      window: msg.windows[0],
      image,
      bbox: grid.bbox,
      grid: { cols: grid.cols, rows: grid.rows, seconds: values },
      home: { end, any: anyValues },
      routes: empty,
      labels: empty,
      outlines,
      computedInMs,
      totalMs: performance.now() - t0,
    } satisfies FromWorker,
    [image.rgba.buffer, values.buffer, anyValues.buffer],
  );
}

/** The last fast connection home from `at`: its pass again, with legs, then the trip. */
async function homeTrip(msg: Extract<ToWorker, { type: 'homeTrip' }>) {
  const h = lastHome;
  if (!h || h.id !== msg.map) return null;
  const cell = cellIndex(h.grid, msg);
  const stop = cell < 0 ? -1 : h.grid.stop![cell];
  const pass = h.passes[stop >= 0 ? h.fastPass[stop] : h.passes.length - 1];
  const tt = await prepared(pass.window, 'arrive', h.variant);
  const w = travelOptions(h.travel);
  const result = travelTimes(tt, h.origin, { trackLegs: true, leaveAt: pass.leaveAt, ...w });
  lastTrip = { tt, runs: [], direction: 'arrive', travel: h.travel, leaveAt: null, from: 0 };
  // Its minutes would include waiting at home for the deadline, so the card leaves them out.
  return trip(lastTrip!, { ...nearRun(tt, result, msg, w), seconds: undefined }, msg);
}

/** The last two "where can I live?" maps by id: each favourite's grid, for the minutes on tap. */
const livings = new Map<number, { layout: HeatGrid; seconds: Float32Array[] }>();
/** The newest "where can I live?" request; an older one stops at its next place. */
let livingId = 0;

async function living(msg: Extract<ToWorker, { type: 'living' }>) {
  const t0 = performance.now();
  livingId = msg.id;
  walkSpeedMps = msg.walkKmh / 3.6;
  const travel = msg.travel ?? 'walk';
  const variant = { stepFree: msg.stepFree, bike: travel === 'bike' };
  const tt = await prepared(msg.window, 'arrive', variant);
  const w = travelOptions(travel);
  const seconds: Float32Array[] = [];
  let layout: HeatGrid | null = null;
  let computedInMs = 0;
  for (const [i, p] of msg.places.entries()) {
    // Typisch, averaged over the hour: the fair measure for a place you go to again and again.
    let g: HeatGrid;
    if (travel === 'bikeonly') g = run(tt, p, true, travel, false).shown;
    else {
      const r = travelTimes(tt, p, { typical: true, ...w });
      computedInMs += r.computedInMs;
      g = heatGrid(tt, { ...r, stopSeconds: r.typicalSeconds! }, { cellSizeM: CELL_M, ...w });
    }
    layout ??= g;
    seconds.push(g.seconds);
    post({ type: 'mapProgress', id: msg.id, done: i + 1, total: msg.places.length });
    // Let a newer request (or a tap) in between places.
    await new Promise((r) => setTimeout(r, 0));
    if (livingId !== msg.id) return;
  }
  if (!layout) return;
  livings.set(msg.id, { layout, seconds });
  for (const id of livings.keys()) if (livings.size > 2) livings.delete(id);
  const grid: HeatGrid = {
    ...layout,
    stop: undefined,
    seconds: scoreGrid(
      seconds,
      msg.places.map((p) => p.weight),
    ),
  };
  const image = paint(grid);
  const outlines = traceOutlines(grid.seconds, grid.cols, grid.rows, grid.bbox, OUTLINE_BLUR_CELLS);
  const empty = { type: 'FeatureCollection' as const, features: [] };
  const values = Float32Array.from(grid.seconds) as Float32Array<ArrayBuffer>;
  ctx.postMessage(
    {
      type: 'result',
      id: msg.id,
      window: msg.window,
      image,
      bbox: grid.bbox,
      grid: { cols: grid.cols, rows: grid.rows, seconds: values },
      living: true,
      routes: empty,
      labels: empty,
      outlines,
      computedInMs,
      totalMs: performance.now() - t0,
    } satisfies FromWorker,
    [image.rgba.buffer, values.buffer],
  );
}

/** Stations with at least this many departures an hour can be suggested as meeting points. */
const MEET_MIN_PER_HOUR = 6;
const meetCache = new WeakMap<PreparedTimetable, MeetCandidate[]>();
/** Meeting-point candidates: the stations of this timetable, worked out once per file. */
function meetCandidates(tt: PreparedTimetable): MeetCandidate[] {
  let c = meetCache.get(tt);
  if (!c) {
    c = stations(tt, departuresPerHour(tt))
      .features.filter((f) => f.properties.perHour >= MEET_MIN_PER_HOUR)
      .map((f) => ({
        name: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }));
    meetCache.set(tt, c);
  }
  return c;
}

/** The smallest finite value (0 when there is none). */
function minFinite(values: Float32Array): number {
  let m = Infinity;
  for (const v of values) if (v < m) m = v;
  return m < Infinity ? m : 0;
}

/** The grid cell at a point; -1 outside the grid. */
function cellIndex(g: HeatGrid, p: { lat: number; lon: number }): number {
  const [w, s, e, n] = g.bbox;
  const c = Math.floor(((p.lon - w) / (e - w)) * g.cols);
  const r = Math.floor(((n - p.lat) / (n - s)) * g.rows);
  return c < 0 || c >= g.cols || r < 0 || r >= g.rows ? -1 : r * g.cols + c;
}

/** A grid's time at a point; Infinity outside it. */
function cellSeconds(g: HeatGrid, p: { lat: number; lon: number }): number {
  const i = cellIndex(g, p);
  return i < 0 ? Infinity : g.seconds[i];
}

interface Run {
  result: TravelTimeResult;
  /** The pass from now that trips on tap follow (see nowRun), made on the first tap. */
  now?: TravelTimeResult;
  /** Best-case grid with the stop each cell is reached from (lines and trips follow it). */
  best: HeatGrid;
  /** The grid the map shows: best case, or typical with waiting included. */
  shown: HeatGrid;
  used: UsedSegment[];
}

function run(
  tt: PreparedTimetable,
  origin: Origin,
  typical: boolean,
  travel: Travel,
  usage = true,
  leaveAt?: number,
): Run {
  if (travel === 'bikeonly') {
    // Cycling all the way: no stops, just the street network out to an hour.
    const w = { walk, walkSpeedMps: BIKE_SPEED_MPS };
    const reach = {
      maxFinalWalkSeconds: BIKE_ONLY_MAX_SECONDS,
      maxFallbackWalkSeconds: BIKE_ONLY_MAX_SECONDS,
    };
    const access = travelTimes(tt, origin, { trackLegs: usage, maxRounds: 0, ...w });
    const result = { ...access, stopSeconds: new Float32Array(tt.stopCount).fill(Infinity) };
    const best = heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: usage, ...w, ...reach });
    return { result, best, shown: best, used: [] };
  }
  const w = travelOptions(travel);
  const result = travelTimes(tt, origin, { trackLegs: usage, typical, leaveAt, ...w });
  const best = heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: usage, ...w });
  const shown =
    typical && result.typicalSeconds
      ? heatGrid(tt, { ...result, stopSeconds: result.typicalSeconds }, { cellSizeM: CELL_M, ...w })
      : best;
  const used = usage ? routeUsage(tt, result, best, { minShare: MIN_ROUTE_SHARE }) : [];
  return { result, best, shown, used };
}

/** Routing and grid options for walking, or cycling to and from the stations. */
function travelOptions(travel: Travel) {
  return travel === 'bike'
    ? {
        walk,
        walkSpeedMps: BIKE_SPEED_MPS,
        accessPenaltySeconds: BIKE_STATION_SECONDS,
        egressPenaltySeconds: BIKE_STATION_SECONDS,
        // Cycling all the way stays an option where it beats the trains.
        maxOriginSeconds: BIKE_ONLY_MAX_SECONDS,
        // Until the street network is in, straight-line rides spread over ten
        // minutes only, so the first map is as quick as on foot.
        ...(walk ? {} : { maxFinalWalkSeconds: 600, maxFallbackWalkSeconds: 600 }),
      }
    : { walk, walkSpeedMps };
}

/** The last computed map, kept for trip lookups on tap. */
let lastTrip: {
  tt: PreparedTimetable;
  runs: Run[];
  direction: Direction;
  travel: Travel;
  /** When trips on tap leave, if not with the map's own pass. */
  leaveAt: number | null;
  /** The moment trips on tap leave from (seconds of the service day), departing. */
  from: number;
} | null = null;

/** What a trip is rebuilt from; `seconds` is the trip's own time when it leaves now. */
type TripRun = Pick<Run, 'result' | 'best'> & { seconds?: number };

/**
 * What a trip on tap follows: the connection that arrives earliest when leaving now,
 * waiting for the departure included. With "Nächste" that is the map itself; otherwise a
 * single RAPTOR pass from now (once per map and start), and a grid around the tapped
 * place only, so a tap stays quick.
 */
function nowRun(
  last: NonNullable<typeof lastTrip>,
  r: Run,
  at: { lat: number; lon: number },
): TripRun {
  if (last.leaveAt === null || last.travel === 'bikeonly') return r;
  const w = travelOptions(last.travel);
  const o = r.result.origin!;
  r.now ??= travelTimes(last.tt, o, { trackLegs: true, leaveAt: last.leaveAt, ...w });
  return nearRun(last.tt, r.now, at, w);
}

/** As nowRun, leaving at `last.leaveAt` instead of the map's moment; not kept. */
function laterRun(
  last: NonNullable<typeof lastTrip> & { leaveAt: number },
  r: Run,
  at: { lat: number; lon: number },
): TripRun {
  const w = travelOptions(last.travel);
  const result = travelTimes(last.tt, r.result.origin!, {
    trackLegs: true,
    leaveAt: last.leaveAt,
    ...w,
  });
  return nearRun(last.tt, result, at, w);
}

/** A grid around `at` only (from the stops it can be walked or ridden to), for its trip. */
function nearRun(
  tt: PreparedTimetable,
  result: TravelTimeResult,
  at: { lat: number; lon: number },
  w: ReturnType<typeof travelOptions>,
): TripRun {
  // Only stops within the longest walk (or ride) from the place can be its last stop.
  const reachM = 2 * 900 * (w.walkSpeedMps ?? NETWORK_WALK_SPEED_MPS) + 100;
  const stopSeconds = Float32Array.from(result.stopSeconds);
  const stops = tt.stops;
  for (let s = 0; s < stopSeconds.length; s++)
    if (distanceM(at.lat, at.lon, stops[s].lat, stops[s].lon) > reachM) stopSeconds[s] = Infinity;
  const best = heatGrid(
    tt,
    { ...result, stopSeconds },
    { cellSizeM: CELL_M, trackStops: true, ...w },
  );
  const [minLon, minLat, maxLon, maxLat] = best.bbox;
  const c = Math.floor(((at.lon - minLon) / (maxLon - minLon)) * best.cols);
  const row = Math.floor(((maxLat - at.lat) / (maxLat - minLat)) * best.rows);
  const inside = c >= 0 && c < best.cols && row >= 0 && row < best.rows;
  return { result, best, seconds: inside ? best.seconds[row * best.cols + c] : Infinity };
}

/** The fastest journey to (or, arriving, from) the tapped spot, in travel order. */
function trip(
  last: NonNullable<typeof lastTrip>,
  r: TripRun,
  at: { lat: number; lon: number },
): {
  journey: Journey;
  start: [number, number];
  end: [number, number];
  seconds?: number;
  /** Departing: when to leave the start and when the trip arrives (seconds of the day). */
  leave?: number;
  arrive?: number;
  /** Departing: the first vehicle, for its live status. */
  board?: { stop: number; line: string; at: number };
} | null {
  const j = journeyTo(last.tt, r.result, r.best, at.lat, at.lon);
  if (!j) return null;
  const seconds = r.seconds;
  const o = r.result.origin!;
  const here: [number, number] = [at.lon, at.lat];
  const point: [number, number] = [o.lon, o.lat];
  if (last.direction === 'depart') {
    // Leaving from `from`, the trip arrives after the place's time (waiting included);
    // the walk to the first vehicle starts just in time for it.
    const total = seconds ?? cellSeconds(r.best, at);
    const arrive = last.from + total;
    let leave = last.from;
    let board: { stop: number; line: string; at: number } | undefined;
    const first = j.legs.findIndex((l) => l.type === 'ride');
    const ride = j.legs[first];
    if (ride?.type === 'ride') {
      const walkTo = j.legs
        .slice(0, first)
        .reduce((a, l) => a + (l.type === 'walk' ? l.seconds : 0), 0);
      const dep = departureAt(last.tt, ride.route, ride.fromPos, last.from + walkTo);
      if (dep !== null) {
        leave = Math.max(last.from, dep - walkTo);
        board = { stop: ride.from, line: ride.name, at: dep };
      }
    }
    return { journey: j, start: point, end: here, seconds, leave, arrive, board };
  }
  // Arriving: the tree runs backwards in time from the destination, so flip it.
  const legs = [...j.legs]
    .reverse()
    .map((l) =>
      l.type === 'ride' ? { ...l, from: l.to, to: l.from, stops: [...l.stops].reverse() } : l,
    );
  return { journey: { ...j, legs }, start: here, end: point, seconds };
}

function tripMessage(
  found: ReturnType<typeof trip>[],
): Omit<Extract<FromWorker, { type: 'trip' }>, 'type' | 'id'> {
  const tt = lastTrip?.tt;
  const features: Extract<FromWorker, { type: 'trip' }>['lines']['features'] = [];
  const line = (coordinates: [number, number][], mode: string, walk: boolean) => {
    if (coordinates.length >= 2)
      features.push({
        type: 'Feature',
        properties: { mode, walk },
        geometry: { type: 'LineString', coordinates },
      });
  };
  // Walks follow the footpaths their minutes were measured on, once walk.bin is in;
  // until then (or off the network) they stay straight.
  // Cycled legs (to the first and from the last stop) are drawn solid and thin.
  const walkLine = (a: [number, number], b: [number, number], bike = false) => {
    if (a[0] === b[0] && a[1] === b[1]) return;
    const path = walk && walkPath(walk, { lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] });
    line(path ?? [a, b], bike ? 'bike' : 'walk', true);
  };
  const cycling = lastTrip?.travel !== undefined && lastTrip.travel !== 'walk';
  const stops = new Map<
    number,
    Extract<FromWorker, { type: 'trip' }>['stops']['features'][number]
  >();
  const stopPoint = (s: number) => {
    if (!tt || stops.has(s)) return;
    stops.set(s, {
      type: 'Feature',
      properties: { name: tt.stops[s].name.replace(/ \(Berlin\)$/, '').replace(/^Berlin, /, '') },
      geometry: { type: 'Point', coordinates: [tt.stopLon[s], tt.stopLat[s]] },
    });
  };
  const journeys = found.map((f) => {
    if (!f || !tt) return null;
    const pos = (s: number): [number, number] => [tt.stopLon[s], tt.stopLat[s]];
    let at = f.start;
    const legs: TripLeg[] = [];
    const all = f.journey.legs;
    const firstRide = all.findIndex((l) => l.type === 'ride');
    const lastRide = all.length - 1 - [...all].reverse().findIndex((l) => l.type === 'ride');
    // With a bike, the ways to the first stop and from the last one are cycled.
    const cycled = (i: number) => cycling && (firstRide < 0 || i < firstRide || i > lastRide);
    for (const [i, l] of all.entries()) {
      if (l.type === 'walk') {
        const minutes = Math.max(1, Math.round(l.seconds / 60));
        legs.push(cycled(i) ? { type: 'walk', minutes, bike: true } : { type: 'walk', minutes });
        continue;
      }
      walkLine(at, pos(l.from), i === firstRide && cycling);
      line(course(tt, l.stops), l.mode, false);
      stopPoint(l.from);
      stopPoint(l.to);
      at = pos(l.to);
      legs.push({
        type: 'ride',
        name: l.name,
        mode: l.mode,
        from: tt.stops[l.from].name,
        to: tt.stops[l.to].name,
        stops: l.stops.length - 1,
      });
    }
    walkLine(at, f.end, cycling);
    return {
      legs,
      transfers: f.journey.transfers,
      ...(f.seconds !== undefined ? { minutes: Math.round(f.seconds / 60) } : {}),
      ...(f.leave !== undefined ? { leave: f.leave, arrive: f.arrive } : {}),
      ...(f.board ? { board: f.board } : {}),
    };
  });
  return {
    journeys,
    lines: { type: 'FeatureCollection', features },
    stops: { type: 'FeatureCollection', features: [...stops.values()] },
  };
}

/** Meeting point: each cell gets the slowest trip ("where can we all be in N min?"). */
function slowestOf(grids: HeatGrid[]): HeatGrid {
  if (grids.length === 1) return grids[0];
  const seconds = Float32Array.from(grids[0].seconds);
  for (const g of grids.slice(1))
    for (let i = 0; i < seconds.length; i++)
      if (g.seconds[i] > seconds[i]) seconds[i] = g.seconds[i];
  return { ...grids[0], seconds, stop: undefined };
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
function paint(
  grid: HeatGrid,
  values?: Float32Array,
  lut = LUT,
  offset = 0,
  win?: PaintWindow,
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
        if (!(v < Infinity)) continue;
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
function windowUpTo(values: Float32Array, cols: number, rows: number, max: number) {
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

/**
 * Comparing two times: colours how much longer (or shorter) each trip takes at the
 * second time. Places reachable at only one of them get the strongest colour.
 */
function paintDiff(a: HeatGrid, b: HeatGrid) {
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
      geometry: { type: 'LineString', coordinates: course(tt, [s.a, s.b]) },
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
            coordinates: course(tt, path),
          },
          properties: { names },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
