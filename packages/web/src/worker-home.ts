// The maps shown instead of a start's: "Bis wann komme ich heim?" and "Where can I live?".
import {
  heatGrid,
  travelTimes,
  type HeatGrid,
  type PreparedTimetable,
  type TravelTimeResult,
} from '@berlin-transit-heatmap/routing';
import { HOME_OUTLINE_MINUTES } from './colors';
import { outlines as traceOutlines } from './contours';
import { scoreGrid } from './favourites';
import { bestCells } from './meet';
import { OUTLINE_BLUR_CELLS, paint } from './paint';
import type { FromWorker, ToWorker, Travel, Window } from './protocol';
import { HOME_LUT } from './worker-paint';
import { setWalkKmh } from './worker-paths';
import { ctx, post } from './worker-post';
import { CELL_M, cellIndex, run, travelOptions } from './worker-runs';
import { prepared, type Variant } from './worker-timetables';
import { setLastTrip, trip, nearRun } from './worker-trips';

/** Deadlines step through each file this far apart, from 2 h after its start. */
const HOME_STEP_S = 900;
/**
 * The two limits a way home is measured by (Hendrik): under 1 h (the map's colours and
 * the card's main line) and under 1 h 30 (the card's second line). Waiting included.
 */
const HOME_FAST_S = 3600;
const HOME_MAX_S = 5400;

/** Seconds after midnight of the evening a file's hour starts at (1 Uhr = 25 h). */
const eveningSeconds = (window: Window) => {
  const h = Number(window.slice(-2));
  return (h < 12 ? h + 24 : h) * 3600;
};

/** The last home map: what a tap needs to rebuild its last fast connection. */
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
 * Per stop, the latest departure that still gets home within HOME_MAX_S (any) and within
 * HOME_FAST_S (fast). Each pass is an arrive-by RAPTOR from home: a deadline D gives every stop's latest
 * departure L = D - seconds. File h serves deadlines from h+2:15 to h+3, which its trips
 * (departing up to 3 h after its start) cover for journeys leaving after h.
 */
export async function home(msg: Extract<ToWorker, { type: 'home' }>) {
  const t0 = performance.now();
  livingId = msg.id;
  setWalkKmh(msg.walkKmh);
  const travel = msg.travel ?? 'walk';
  const variant = { stepFree: msg.stepFree, bike: travel === 'bike' };
  const w = travelOptions(travel);
  const origin = { lat: msg.lat, lon: msg.lon };
  const passes: { window: Window; leaveAt: number }[] = [];
  let fast: Float64Array | null = null;
  let any: Float64Array | null = null;
  let fastPass: Uint8Array | null = null;
  let tt: PreparedTimetable | null = null;
  let computedInMs = 0;
  const steps = 3600 / HOME_STEP_S;
  for (const [f, window] of msg.windows.entries()) {
    tt = await prepared(window, 'arrive', variant);
    const S = tt.stopCount;
    fast ??= new Float64Array(S).fill(-Infinity);
    any ??= new Float64Array(S).fill(-Infinity);
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
        if (L > any[s]) any[s] = L;
        if (secs <= HOME_FAST_S && L > fast[s]) {
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
export async function homeTrip(msg: Extract<ToWorker, { type: 'homeTrip' }>) {
  const h = lastHome;
  if (!h || h.id !== msg.map) return null;
  const cell = cellIndex(h.grid, msg);
  const stop = cell < 0 ? -1 : h.grid.stop![cell];
  const pass = h.passes[stop >= 0 ? h.fastPass[stop] : h.passes.length - 1];
  const tt = await prepared(pass.window, 'arrive', h.variant);
  const w = travelOptions(h.travel);
  const result = travelTimes(tt, h.origin, { trackLegs: true, leaveAt: pass.leaveAt, ...w });
  const last = {
    tt,
    runs: [],
    direction: 'arrive' as const,
    travel: h.travel,
    leaveAt: null,
    from: 0,
  };
  setLastTrip(last);
  // Its minutes would include waiting at home for the deadline, so the card leaves them out.
  return trip(last, { ...nearRun(tt, result, msg, w), seconds: undefined }, msg);
}

/**
 * The last "where can I live?" map: each favourite's whole seconds per cell (65535: not
 * reached), for the minutes on tap. Two bytes a cell instead of four, and one map only.
 */
let livingMap: { id: number; layout: HeatGrid; seconds: Uint16Array[] } | null = null;
const LIVING_NONE = 0xffff;

/**
 * A grid's seconds as whole seconds in two bytes (LIVING_NONE where not reached). Rounded
 * down, so the minutes on tap round exactly as from the full value (a half minute is a
 * whole second).
 */
function livingSeconds(g: Float32Array): Uint16Array {
  const out = new Uint16Array(g.length);
  for (let i = 0; i < g.length; i++) {
    const v = g[i]!;
    out[i] = v < LIVING_NONE ? Math.floor(v) : LIVING_NONE;
  }
  return out;
}
/** The newest "where can I live?" request; an older one stops at its next place. */
let livingId = 0;
/** A start's map was asked for: a running "where can I live?" or home map is not wanted. */
export function cancelSpecial() {
  livingId = 0;
}

export async function living(msg: Extract<ToWorker, { type: 'living' }>) {
  const t0 = performance.now();
  livingId = msg.id;
  setWalkKmh(msg.walkKmh);
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
  livingMap = {
    id: msg.id,
    // The layout only (bbox and size): not the first place's full-precision grid.
    layout: { ...layout, stop: undefined, seconds: new Float32Array(0) },
    seconds: seconds.map(livingSeconds),
  };
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
      // Its three best spots for the pins (one pass per spot over the grid, here and not
      // on the main thread).
      best: bestCells(grid.seconds, grid.cols, grid.rows, grid.bbox),
      routes: empty,
      labels: empty,
      outlines,
      computedInMs,
      totalMs: performance.now() - t0,
    } satisfies FromWorker,
    [image.rgba.buffer, values.buffer],
  );
}

/** Everyone's minutes to a tapped place on the last "where can I live?" map. */
export function livingAt(
  msg: Extract<ToWorker, { type: 'livingAt' }>,
): Extract<FromWorker, { type: 'livingAt' }> {
  const l = livingMap?.id === msg.map ? livingMap : null;
  const i = l ? cellIndex(l.layout, msg) : -1;
  const minutes = (l?.seconds ?? []).map((g) => {
    const v = i < 0 ? LIVING_NONE : g[i]!;
    return v < LIVING_NONE ? Math.round(v / 60) : null;
  });
  return { type: 'livingAt', id: msg.id, minutes };
}
