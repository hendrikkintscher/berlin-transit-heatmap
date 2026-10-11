/// <reference lib="webworker" />
import {
  BIKE_ONLY_MAX_SECONDS,
  BIKE_SPEED_MPS,
  BIKE_STATION_SECONDS,
  bikeTimetable,
  gridLayout,
  heatGrid,
  journeyTo,
  walkPath,
  loadTimetable,
  loadWalkNetwork,
  snapCells,
  reverseTimetable,
  routeUsage,
  stepFreeTimetable,
  travelTimes,
  type HeatGrid,
  type Journey,
  type Origin,
  type PreparedTimetable,
  type Timetable,
  type TravelTimeResult,
  type UsedSegment,
  type WalkNetwork,
} from '@berlin-transit-heatmap/routing';
import type { FeatureCollection, LineString } from 'geojson';
import { colorLut, DIFF_MAX_S, DIFF_MIN_S, diffLut } from './colors';
import { blurSeconds, warpField } from './soften';
import { contours } from './contours';
import { accessGrid, departuresPerHour, stations } from './layers';
import { suggestMeetingPoints, type MeetCandidate } from './meet';
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
/** The image has UPSAMPLE x UPSAMPLE pixels per grid cell (25 m pixels). */
const UPSAMPLE = 2;
const UPSAMPLE_SHIFT = 1;
/** Blur for the isochrone outlines, in grid cells (50 m). */
const OUTLINE_BLUR_CELLS = 6;
/** Softening, in grid cells (50 m) and seconds. Purely visual; the readout uses the raw grid. */
const SOFT = { blurCells: 2, warpCells: 2.5, warpWavelengthCells: 9, featherSeconds: 45 };
const LUT = colorLut(SOFT.featherSeconds);
const DIFF_LUT = diffLut();

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

/**
 * The footpath network, fetched in the background once the first timetable is in, so
 * the first map is never held up by it. Until it is ready, walks are straight lines;
 * the UI recomputes the map when it arrives.
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
    if (!res.ok) return;
    const net = loadWalkNetwork(await res.arrayBuffer());
    // Snapping the map grid to the network takes a moment; do it now rather than on a tap.
    const layout = gridLayout({ cellSizeM: CELL_M });
    snapCells(net, layout.bbox, layout.cols, layout.rows);
    walk = net;
    post({ type: 'walk' });
  } catch (err) {
    // Straight-line walking stays in place.
    console.warn('Walking network not used:', err);
  }
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
      void loadWalk();
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

ctx.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      dataBase = msg.dataBase;
    } else if (msg.type === 'load') {
      // A quiet (background) load that fails is retried when the window is actually needed.
      await (msg.quiet ? ensure(msg.window).catch(() => undefined) : ensure(msg.window));
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
      const t0 = performance.now();
      walkSpeedMps = msg.walkKmh / 3.6;
      const travel = msg.travel ?? 'walk';
      const variant = { stepFree: msg.stepFree, bike: travel === 'bike' };
      const tt = await prepared(msg.window, msg.direction, variant);
      const starts = [{ lat: msg.lat, lon: msg.lon }, ...(msg.second ? [msg.second] : [])];
      const typical = msg.measure === 'typical';
      // Next connection: plain RAPTOR from one moment (reversed files count backwards).
      const leaveAt = (t: PreparedTimetable) =>
        msg.measure !== 'next'
          ? undefined
          : msg.direction === 'depart'
            ? t.windowStart + (msg.leaveOffset ?? 0)
            : t.windowEnd;
      const runs = starts.map((o) => run(tt, o, typical, travel, true, leaveAt(tt)));
      const shown = (r: Run) => r.shown;
      const grid =
        runs.length === 1 ? runs[0].shown : slowerOf(...(runs.map(shown) as [HeatGrid, HeatGrid]));
      const used = runs.flatMap((r) => r.used);
      const routes = usageGeoJSON(tt, used);
      const labels = labelLines(tt, used);
      lastTrip = { tt, runs, direction: msg.direction, travel };

      let image: ReturnType<typeof paint>;
      let outlines: ReturnType<typeof contours>;
      let compare: Float32Array<ArrayBuffer> | undefined;
      let extraBase: number | undefined;
      if (msg.compare) {
        const tt2 = await prepared(msg.compare, msg.direction, variant);
        const other = starts.map((o) => run(tt2, o, typical, travel, false, leaveAt(tt2)).shown);
        const g2 = other.length === 1 ? other[0] : slowerOf(other[0], other[1]);
        compare = g2.seconds as Float32Array<ArrayBuffer>;
        image = paintDiff(grid, g2);
        outlines = { type: 'FeatureCollection', features: [] };
      } else {
        // Meeting point: colour the extra minutes over the best spot, so it is always green.
        extraBase = runs.length === 2 ? minFinite(grid.seconds) : 0;
        const shownSeconds = extraBase ? grid.seconds.map((v) => v - extraBase!) : grid.seconds;
        image = paint(grid, shownSeconds);
        // Outlines follow a more strongly blurred field, so walk bubbles round off.
        outlines = contours(
          blurSeconds(shownSeconds, grid.cols, grid.rows, OUTLINE_BLUR_CELLS),
          grid.cols,
          grid.rows,
          grid.bbox,
        );
      }
      // The grids stay here for trip lookups, so the UI gets copies.
      const seconds = Float32Array.from(grid.seconds) as Float32Array<ArrayBuffer>;
      const each =
        runs.length === 2
          ? (runs.map((r) => Float32Array.from(r.shown.seconds)) as [
              Float32Array<ArrayBuffer>,
              Float32Array<ArrayBuffer>,
            ])
          : undefined;
      // Meeting point: a few stations both reach quickly, from each start's own times.
      const candidates = runs.length === 2 ? meetCandidates(tt) : [];
      const meet =
        runs.length === 2
          ? suggestMeetingPoints(candidates, (i) => [
              cellSeconds(runs[0].shown, candidates[i]),
              cellSeconds(runs[1].shown, candidates[i]),
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
          meet,
          ...(runs.length === 2 && extraBase !== undefined ? { extraBase } : {}),
          compare,
          routes,
          labels,
          outlines,
          computedInMs: runs.reduce((a, r) => a + r.result.computedInMs, 0),
          totalMs: performance.now() - t0,
        } satisfies FromWorker,
        [
          image.rgba.buffer,
          seconds.buffer,
          ...(each ? each.map((e) => e.buffer) : []),
          ...(compare ? [compare.buffer] : []),
        ],
      );
    } else if (msg.type === 'trip') {
      const journeys = (lastTrip?.runs ?? []).map((r) => trip(lastTrip!, r, msg));
      post({ type: 'trip', id: msg.id, ...tripMessage(journeys) });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

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

/** A grid's time at a point; Infinity outside it. */
function cellSeconds(g: HeatGrid, p: { lat: number; lon: number }): number {
  const [w, s, e, n] = g.bbox;
  const c = Math.floor(((p.lon - w) / (e - w)) * g.cols);
  const r = Math.floor(((n - p.lat) / (n - s)) * g.rows);
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) return Infinity;
  return g.seconds[r * g.cols + c];
}

interface Run {
  result: TravelTimeResult;
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
  const w =
    travel === 'bike'
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
  const result = travelTimes(tt, origin, { trackLegs: usage, typical, leaveAt, ...w });
  const best = heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: usage, ...w });
  const shown =
    typical && result.typicalSeconds
      ? heatGrid(tt, { ...result, stopSeconds: result.typicalSeconds }, { cellSizeM: CELL_M, ...w })
      : best;
  const used = usage ? routeUsage(tt, result, best, { minShare: MIN_ROUTE_SHARE }) : [];
  return { result, best, shown, used };
}

/** The last computed map, kept for trip lookups on tap. */
let lastTrip: {
  tt: PreparedTimetable;
  runs: Run[];
  direction: Direction;
  travel: Travel;
} | null = null;

/** The fastest journey to (or, arriving, from) the tapped spot, in travel order. */
function trip(
  last: NonNullable<typeof lastTrip>,
  r: Run,
  at: { lat: number; lon: number },
): { journey: Journey; start: [number, number]; end: [number, number] } | null {
  const j = journeyTo(last.tt, r.result, r.best, at.lat, at.lon);
  if (!j) return null;
  const o = r.result.origin!;
  const here: [number, number] = [at.lon, at.lat];
  const point: [number, number] = [o.lon, o.lat];
  if (last.direction === 'depart') return { journey: j, start: point, end: here };
  // Arriving: the tree runs backwards in time from the destination, so flip it.
  const legs = [...j.legs]
    .reverse()
    .map((l) =>
      l.type === 'ride' ? { ...l, from: l.to, to: l.from, stops: [...l.stops].reverse() } : l,
    );
  return { journey: { ...j, legs }, start: here, end: point };
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
      line(l.stops.map(pos), l.mode, false);
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
    return { legs, transfers: f.journey.transfers };
  });
  return {
    journeys,
    lines: { type: 'FeatureCollection', features },
    stops: { type: 'FeatureCollection', features: [...stops.values()] },
  };
}

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
function paint(grid: HeatGrid, values?: Float32Array, lut = LUT, offset = 0) {
  const { cols, rows } = grid;
  const lutMax = lut.length / 4 - 1;
  const seconds = blurSeconds(values ?? grid.seconds, cols, rows, SOFT.blurCells);
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
      const i = v + offset;
      const k = (i >= lutMax ? lutMax : i <= 0 ? 0 : (i + 0.5) | 0) * 4;
      rgba[o] = lut[k];
      rgba[o + 1] = lut[k + 1];
      rgba[o + 2] = lut[k + 2];
      rgba[o + 3] = 255;
    }
  }
  return { width, height, rgba };
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
