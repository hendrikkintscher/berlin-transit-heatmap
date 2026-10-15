/// <reference lib="webworker" />
// The routing worker: answers the app's messages. Timetables (worker-timetables.ts), the
// footpaths and line courses (worker-paths.ts), a start's map (worker-runs.ts), trips on
// tap (worker-trips.ts), the home and where-to-live maps (worker-home.ts) and the extra
// colour images (worker-paint.ts) live in their own modules.
import { REGION, type PreparedTimetable } from '@berlin-transit-heatmap/routing';
import { outlines as traceOutlines } from './contours';
import { OUTLINE_BLUR_CELLS, paint } from './paint';
import { accessGrid, departuresPerHour, stations } from './layers';
import { suggestMeetingPoints } from './meet';
import { earlyLoad, linkHasStart } from './early';
import { computeRequest, linkState, readFrom, sameRequest, type ComputeRequest } from './state';
import { whenAt } from './when';
import { setDataVersions } from './data-url';
import type { Direction, FromWorker, ToWorker } from './protocol';
import { cancelSpecial, home, homeTrip, living, livingAt } from './worker-home';
import { paintDesert, paintDiff, paintShown, type Shown } from './worker-paint';
import {
  labelLines,
  lastTimetable,
  linesSettled,
  loadWalk,
  mapShown,
  NO_LINES,
  setLastRoutes,
  setWalkKmh,
  startBackground,
  usageGeoJSON,
  walk,
  walkSpeedMps,
} from './worker-paths';
import { ctx, nextTask, post } from './worker-post';
import {
  cellSeconds,
  fileHourStart,
  goalRun,
  meetCandidates,
  minFinite,
  run,
  slowestOf,
} from './worker-runs';
import { ensure, prepared, setDataBase } from './worker-timetables';
import {
  moreTrips,
  nearestStopName,
  nextHour,
  setLastTrip,
  tripsReady,
  tapTrip,
  tripMessage,
  warmNextTrip,
} from './worker-trips';

/**
 * The last map's grid, for painting it again ('paint'); `offset` is added to its times for
 * the colours (a meeting point shows the minutes over the best spot).
 */
let lastShown: Shown | null = null;

/**
 * The newest map and trip asked for. A request that a newer one has replaced is dropped
 * (the app shows only the newest): checked once the messages queued behind it are in, and
 * again after a timetable had to be loaded.
 */
let latestCompute = 0;
let latestTrip = 0;
/** The drawer's last list asked for (see moreTrips). */
let latestMore = 0;

type ComputeMsg = Extract<ToWorker, { type: 'compute' }>;
type Made = NonNullable<Awaited<ReturnType<typeof makeMap>>>;

/**
 * The first map, made from the link and the device's settings as the start page handed them
 * on, before the app asks for it (the same request main.ts will make: linkState and
 * computeRequest in state.ts). Dropped when the app asks for another map first.
 */
let firstMap: { request: ComputeRequest; made: Promise<Made | null>; wanted: boolean } | null =
  null;

function mapAhead(boot: Extract<ToWorker, { type: 'boot' }>): typeof firstMap {
  const at = new Date(boot.at);
  const { state } = linkState(boot.search, readFrom(boot.stored), whenAt(at));
  if (!state.origin) return null;
  const request = computeRequest({ ...state, origin: state.origin }, at);
  const ahead = { request, made: Promise.resolve<Made | null>(null), wanted: true };
  // (Should it fail, the app's own request tries again.)
  ahead.made = makeMap({ type: 'compute', id: 0, ...request }, () => ahead.wanted).catch(
    () => null,
  );
  return ahead;
}

/** `f`, run once on first use. */
function once<T>(f: () => T): () => T {
  let made: { value: T } | null = null;
  return () => (made ??= { value: f() }).value;
}

/**
 * A start's map: its grid of minutes, colours, outlines and lines, not yet sent. Null when
 * no longer `fresh` (a newer request came in). A tap meanwhile gets its trip first.
 */
async function makeMap(msg: ComputeMsg, fresh: () => boolean) {
  setWalkKmh(msg.walkKmh);
  const travel = msg.travel ?? 'walk';
  const variant = { stepFree: msg.stepFree, bike: travel === 'bike' };
  // A map to the place runs on the timetable backwards: arriving, or leaving (toGoal).
  const goal = msg.toGoal === true;
  const to: Direction = goal || msg.direction === 'arrive' ? 'arrive' : 'depart';
  const tt = await prepared(msg.window, to, variant);
  if (!fresh()) return null;
  const starts = [{ lat: msg.lat, lon: msg.lon }, ...(msg.others ?? [])];
  const meeting = starts.length > 1;
  const typical = msg.measure === 'typical';
  // Next connection: plain RAPTOR from one moment (reversed files count backwards).
  const now = (t: PreparedTimetable) =>
    goal
      ? // Leaving to the place: the hour's start in real time, from the reversed file.
        fileHourStart(t) + (msg.leaveOffset ?? 0)
      : msg.direction === 'depart'
        ? t.windowStart + (msg.leaveOffset ?? 0)
        : // Reversed files count backwards: later arrivals are further below windowEnd.
          t.windowEnd - (msg.arriveOffset ?? 0);
  const leaveAt = (t: PreparedTimetable) => (msg.measure === 'next' ? now(t) : undefined);
  const make = (t: PreparedTimetable, o: { lat: number; lon: number }, usage: boolean) =>
    goal
      ? goalRun(t, o, msg.measure, now(t), travel, usage)
      : run(t, o, typical, travel, usage, leaveAt(t));
  const runs = starts.map((o) => make(tt, o, true));
  // A tap while this map was computed gets its trip first, from the map still shown;
  // the colours and outlines follow right after.
  const trips = latestTrip;
  await nextTask();
  if (latestTrip !== trips) await nextTask();
  if (!fresh()) return null;
  const grid = slowestOf(runs.map((r) => r.shown));
  const used = runs.flatMap((r) => r.used);
  const routes = linesSettled ? usageGeoJSON(tt, used) : NO_LINES;
  const labels = linesSettled ? labelLines(tt, used) : NO_LINES;

  let image: ReturnType<typeof paint>;
  let outlines: ReturnType<typeof traceOutlines>;
  let compare: Float32Array<ArrayBuffer> | undefined;
  let extraBase: number | undefined;
  let shown: Shown | null = null;
  let unpainted = false;
  if (msg.compare) {
    const tt2 = await prepared(msg.compare, to, variant);
    if (!fresh()) return null;
    const other = starts.map((o) => make(tt2, o, false).shown);
    const g2 = slowestOf(other);
    compare = g2.seconds as Float32Array<ArrayBuffer>;
    image = paintDiff(grid, g2);
    outlines = { type: 'FeatureCollection', features: [] };
  } else {
    // Meeting point: colour the extra minutes over the best spot, so it is always green.
    extraBase = meeting ? minFinite(grid.seconds) : 0;
    // (Painted and traced with the offset, so the grid is not copied.)
    shown = { id: msg.id, grid, offset: -extraBase };
    if (msg.noImage && !msg.limit) {
      // Heatmap off: the outlines come first; the colours wait for a 'paint'.
      image = { width: 1, height: 1, rgba: new Uint8ClampedArray(4) };
      unpainted = true;
    } else image = paintShown(shown, msg.limit);
    // Outlines follow a more strongly blurred field, so walk bubbles round off.
    outlines = traceOutlines(
      grid.seconds,
      grid.cols,
      grid.rows,
      grid.bbox,
      OUTLINE_BLUR_CELLS,
      undefined,
      -extraBase,
    );
  }
  // The grids stay here for trip lookups, so the UI gets copies.
  const seconds = Float32Array.from(grid.seconds) as Float32Array<ArrayBuffer>;
  const each = meeting
    ? runs.map((r) => Float32Array.from(r.shown.seconds) as Float32Array<ArrayBuffer>)
    : undefined;
  // Meeting point: a few stations everyone reaches quickly, from each start's own times.
  const candidates = meeting ? meetCandidates(tt) : [];
  const meet = meeting
    ? suggestMeetingPoints(candidates, (i) => runs.map((r) => cellSeconds(r.shown, candidates[i])))
    : undefined;
  return {
    tt,
    runs,
    travel,
    from: now(tt),
    grid,
    used,
    shown,
    result: {
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
      ...(unpainted ? { unpainted: true as const } : {}),
      ...(msg.limit && !msg.compare ? { limit: msg.limit } : {}),
    },
    transfer: [
      image.rgba.buffer,
      seconds.buffer,
      ...(each ? each.map((e) => e.buffer) : []),
      ...(compare ? [compare.buffer] : []),
    ],
  };
}

/** Sends a made map as the answer to `msg`, and keeps it for trips, lines and painting. */
function sendMap(msg: ComputeMsg, made: Made, t0: number) {
  const { tt, runs, from } = made;
  setLastRoutes({ id: msg.id, tt, used: made.used });
  setLastTrip({
    tt,
    runs,
    direction: msg.toGoal || msg.direction === 'arrive' ? 'arrive' : 'depart',
    ...(msg.toGoal ? { leaving: from } : {}),
    travel: made.travel,
    variant: { stepFree: msg.stepFree, bike: made.travel === 'bike' },
    // Trips on tap leave now (or, arriving, arrive by the end of the hour): the map's
    // own pass for "Nächste", a pass of their own for Typisch and Bestfall. To the Ziel
    // leaving, each trip is found from its own place (tripBetween).
    leaveAt: msg.measure === 'next' || msg.toGoal ? null : from,
    from,
    other: once(() =>
      prepared(msg.window, msg.toGoal || msg.direction === 'arrive' ? 'depart' : 'arrive', {
        stepFree: msg.stepFree,
        bike: made.travel === 'bike',
      }).catch(() => null),
    ),
  });
  lastShown = made.shown && { ...made.shown, id: msg.id };
  ctx.postMessage(
    {
      type: 'result',
      id: msg.id,
      ...made.result,
      totalMs: performance.now() - t0,
    } satisfies FromWorker,
    made.transfer,
  );
  // The lines' courses come after the first map and the base map, never before them.
  mapShown(tt);
}

ctx.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      setDataBase(msg.dataBase);
      setDataVersions(msg.v);
    } else if (msg.type === 'boot') {
      // From the start page, before the app's code is in: with a start in the link, the first
      // map's timetable, prepared as that map will need it (without one boot.ts asks later),
      // and the map itself.
      setDataBase(new URL(`data/${REGION.id}/`, msg.baseURI).href);
      setDataVersions(msg.v);
      if (!linkHasStart(msg.search)) return;
      const first = earlyLoad(msg.search, {
        stepFree: msg.stored['step-free'] ?? null,
        travel: msg.stored.travel ?? null,
      });
      const loading = prepared(first.window, first.direction, {
        stepFree: first.stepFree,
        bike: first.bike,
      });
      // The first map, while the app's code still loads: it takes it when it asks for it.
      firstMap = mapAhead(msg);
      await loading;
    } else if (msg.type === 'load') {
      // A quiet (background) load that fails is retried when the window is actually needed.
      const variant = { stepFree: msg.stepFree, bike: msg.bike };
      const p = prepared(msg.window, msg.direction ?? 'depart', variant);
      await (msg.quiet ? p.catch(() => undefined) : p);
    } else if (msg.type === 'loadWalk') {
      void loadWalk();
    } else if (msg.type === 'background') {
      startBackground();
    } else if (msg.type === 'moreTrips') {
      latestMore = msg.id;
      await nextTask();
      const [trips, compute] = [latestTrip, latestCompute];
      // Stops as soon as a newer list, a tap or a map is asked for: they go first.
      await moreTrips(
        msg,
        (list, done) => post({ type: 'moreTrips', id: msg.id, trips: list, done }),
        async () => {
          await nextTask();
          return msg.id === latestMore && trips === latestTrip && compute === latestCompute;
        },
      );
    } else if (msg.type === 'downloads') {
      // (Clock times: the timing box turns them into the page's own.)
      const list = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(
        (e) => ({
          name: e.name,
          start: e.startTime + performance.timeOrigin,
          end: e.responseEnd + performance.timeOrigin,
          bytes: e.transferSize,
        }),
      );
      post({ type: 'downloads', list });
    } else if (msg.type === 'placeName') {
      const tt = lastTimetable;
      post({ type: 'placeName', id: msg.id, name: tt && nearestStopName(tt, msg.lat, msg.lon) });
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
      setWalkKmh(msg.walkKmh);
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
      cancelSpecial();
      const t0 = performance.now();
      const fresh = () => msg.id === latestCompute;
      // The first map may be made already (see 'boot'), or under way.
      const ahead = firstMap && sameRequest(firstMap.request, msg) ? firstMap : null;
      if (firstMap) firstMap.wanted = !!ahead;
      firstMap = null;
      const made = (ahead && (await ahead.made)) || (await makeMap(msg, fresh));
      if (!made || !fresh()) return;
      sendMap(msg, made, t0);
      // The first tap's trip needs a pass from now: made ahead, one start at a time, unless
      // a newer map or a tap (which makes its own) is asked for meanwhile.
      const tapped = latestTrip;
      do await nextTask();
      while (msg.id === latestCompute && latestTrip === tapped && warmNextTrip());
      // And the timetable the other way round, which trips on tap need too.
      if (msg.id === latestCompute) await tripsReady();
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
      post(livingAt(msg));
    } else if (msg.type === 'trip') {
      latestTrip = msg.id;
      await nextTask();
      if (msg.id !== latestTrip) return;
      await tripsReady();
      // A connection rolled on past the map's hour: the next hour's file has its trips.
      const next = msg.window && msg.leaveAt !== undefined ? await nextHour(msg.window) : null;
      if (msg.id !== latestTrip) return;
      post({ type: 'trip', id: msg.id, ...tapTrip(msg, next) });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
