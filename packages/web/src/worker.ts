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
import { setDataVersions } from './data-url';
import type { FromWorker, ToWorker } from './protocol';
import { cancelSpecial, home, homeTrip, living, livingAt } from './worker-home';
import { paintDesert, paintDiff, paintShown, type Shown } from './worker-paint';
import {
  labelLines,
  lastTimetable,
  linesSettled,
  mapShown,
  NO_LINES,
  setLastRoutes,
  setWalkKmh,
  startBackground,
  usageGeoJSON,
  walk,
  walkSpeedMps,
} from './worker-paths';
import { ctx, post } from './worker-post';
import { cellSeconds, meetCandidates, minFinite, run, slowestOf } from './worker-runs';
import { ensure, prepared, setDataBase } from './worker-timetables';
import {
  moreTrips,
  nearestStopName,
  setLastTrip,
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
      setDataBase(msg.dataBase);
      setDataVersions(msg.v);
    } else if (msg.type === 'boot') {
      // From the start page, before the app's code is in: with a start in the link, the first
      // map's timetable, prepared as that map will need it (without one boot.ts asks later).
      setDataBase(new URL(`data/${REGION.id}/`, msg.baseURI).href);
      setDataVersions(msg.v);
      if (!linkHasStart(msg.search)) return;
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
      startBackground();
    } else if (msg.type === 'moreTrips') {
      await nextTask();
      post({ type: 'moreTrips', id: msg.id, trips: moreTrips(msg) });
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
      setWalkKmh(msg.walkKmh);
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
      const routes = linesSettled ? usageGeoJSON(tt, used) : NO_LINES;
      setLastRoutes({ id: msg.id, tt, used });
      const labels = linesSettled ? labelLines(tt, used) : NO_LINES;
      setLastTrip({
        tt,
        runs,
        direction: msg.direction,
        travel,
        // Trips on tap leave now (or, arriving, arrive by the end of the hour): the map's
        // own pass for "Nächste", a pass of their own for Typisch and Bestfall.
        leaveAt: msg.measure === 'next' ? null : now(tt),
        from: now(tt),
      });

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
        // (Painted and traced with the offset, so the grid is not copied.)
        lastShown = { id: msg.id, grid, offset: -extraBase };
        if (msg.noImage && !msg.limit) {
          // Heatmap off: the outlines come first; the colours wait for a 'paint'.
          image = { width: 1, height: 1, rgba: new Uint8ClampedArray(4) };
          unpainted = true;
        } else image = paintShown(lastShown, msg.limit);
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
      // The lines' courses come after the first map and the base map, never before them.
      mapShown(tt);
      // The first tap's trip needs a pass from now: made ahead, one start at a time, unless
      // a newer map or a tap (which makes its own) is asked for meanwhile.
      const trips = latestTrip;
      do await nextTask();
      while (msg.id === latestCompute && latestTrip === trips && warmNextTrip());
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
      post({ type: 'trip', id: msg.id, ...tapTrip(msg) });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
