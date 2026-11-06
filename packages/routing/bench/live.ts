// Route quality check and suite (S036, S040): the live site's data and the app's trip on tap.
// The hourly files, stop list and footpaths come from the live site and are kept in
// <data>/live/ (as scripts/layout/screens.mjs keeps them). The trip follows the worker's trip
// on tap (web/src/worker-trips.ts, worker-timetables.ts, worker-runs.ts) for each mode.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BIKE_ONLY_MAX_SECONDS,
  BIKE_SPEED_MPS,
  BIKE_STATION_SECONDS,
  bikeTimetable,
  cellAt,
  cellColRow,
  decodeStopList,
  decodeTimetable,
  distanceM,
  gridLayout,
  heatGrid,
  journeyTo,
  laterChange,
  laterStart,
  loadTimetable,
  loadWalkNetwork,
  needsStopList,
  reverseTimetable,
  stepFreeTimetable,
  travelTimes,
  type Origin,
  type PreparedTimetable,
  type Timetable,
  type HeatGridOptions,
  type TravelTimeOptions,
  type WalkNetwork,
} from '../src';
import { DATA_DIR } from './data';

export const LIVE = 'https://hendrikkintscher.github.io/berlin-transit-heatmap/data/berlin/';
export const LIVE_DIR = join(DATA_DIR, 'live');
export const WALK_MPS = 5 / 3.6;
/** On foot every walk up to 30 minutes counts at both ends (worker-runs.ts FASTEST_WALK). */
export const FASTEST_WALK = {
  maxInitialWalkSeconds: 1800,
  maxFallbackWalkSeconds: 1800,
  maxFinalWalkSeconds: 1800,
};
/** As the worker's trip on tap: 50 m cells, two each way around the destination. */
export const CELL_M = 50;
const NEAR_CELLS = 2;

/**
 * The app's modes: leaving at a minute on foot ('depart'), arriving by one ('arrive'),
 * step-free, and by bike to and from the trains (Unterwegs › Rad + Bahn).
 */
export type Mode = 'depart' | 'arrive' | 'stepfree' | 'bike';

/** A file of the live site (or of `dir`, offline), downloaded once; null when it has none. */
export async function liveFile(name: string, dir = LIVE_DIR, offline = false) {
  const file = join(dir, name);
  if (!existsSync(file)) {
    if (offline) return null;
    const r = await fetch(LIVE + name).catch(() => null);
    if (!r?.ok) return null;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return readFileSync(file);
}

/** Local midnight in Berlin of a date (YYYYMMDD), as epoch ms. */
export function dayStartMs(date: string): number {
  const utc = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  const name = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(utc + 12 * 3600e3))
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT+1"
  return utc - Number(name.replace('GMT', '') || 0) * 3600e3;
}

/** The date `days` after `start` (YYYYMMDD; empty: today in Berlin). */
export function dateOf(start: string, days: number): string {
  const base = start ? dayStartMs(start) + 12 * 3600e3 : Date.now();
  const d = new Date(base + days * 86400e3);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })
    .format(d)
    .replace(/-/g, '');
}

export const isWeekend = (date: string) =>
  [0, 6].includes(
    new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`).getUTCDay(),
  );

/** The data a run needs, from the live site or a folder (`offline`: only that folder). */
export async function liveData(dir = LIVE_DIR, offline = false) {
  const walkBin = await liveFile('walk.bin', dir, offline);
  if (!walkBin) throw new Error(`walk.bin not found (${dir})`);
  const listBin = await liveFile('stoplist.bin', dir, offline);
  const walk = loadWalkNetwork(new Uint8Array(walkBin));
  const stopList = listBin ? decodeStopList(listBin) : undefined;
  const raws = new Map<string, Timetable | null>();
  const prepared = new Map<string, PreparedTimetable | null>();
  const raw = async (file: string) => {
    if (!raws.has(file)) {
      const bin = await liveFile(file, dir, offline);
      raws.set(
        file,
        bin
          ? ((needsStopList(bin) && stopList
              ? decodeTimetable(bin, stopList)
              : decodeTimetable(bin)) as Timetable)
          : null,
      );
    }
    return raws.get(file)!;
  };
  /**
   * The timetable the app uses for a mode at `hour` of `date` (or a named file such as
   * 'weekday-10'): leaving, the hour's own file (step-free and bike filtered as the worker
   * filters them); arriving, the hour before, reversed (computeWindow, worker-timetables).
   */
  async function timetable(date: string, hour: number, mode: Mode, name?: string) {
    let file = name ?? `${date}-${String(hour).padStart(2, '0')}`;
    if (mode === 'arrive' && !name)
      file = hour > 0 ? `${date}-${String(hour - 1).padStart(2, '0')}` : `${dateOf(date, -1)}-23`;
    const key = `${file}:${mode}`;
    if (!prepared.has(key)) {
      const json = await raw(`timetable-${file}.bin`);
      let tt: PreparedTimetable | null = null;
      if (json) {
        const f =
          mode === 'stepfree'
            ? stepFreeTimetable(json)
            : mode === 'bike'
              ? bikeTimetable(json)
              : json;
        tt = loadTimetable(
          mode === 'arrive' ? reverseTimetable(f, f.windowEnd, f.windowEnd + 3600) : f,
        );
      }
      prepared.set(key, tt);
    }
    return prepared.get(key)!;
  }
  return { walk, timetable };
}

/** Routing and grid options, as the worker passes them to both. */
export type Options = TravelTimeOptions & Omit<HeatGridOptions, 'window'>;

/** The routing options of a mode (worker-runs.ts travelOptions). */
export function modeOptions(mode: Mode, walk: WalkNetwork): Options {
  return mode === 'bike'
    ? {
        walk,
        walkSpeedMps: BIKE_SPEED_MPS,
        accessPenaltySeconds: BIKE_STATION_SECONDS,
        egressPenaltySeconds: BIKE_STATION_SECONDS,
        maxOriginSeconds: BIKE_ONLY_MAX_SECONDS,
      }
    : { walk, walkSpeedMps: WALK_MPS, ...FASTEST_WALK };
}

/** The middle of the app's 50 m cell around a place (where the map's minutes are for). */
export function cellCentre(p: Origin): Origin {
  const g = gridLayout({ cellSizeM: CELL_M });
  const [c, r] = cellColRow(g, p.lat, p.lon);
  const [w, s, e, n] = g.bbox;
  return { lon: w + ((c + 0.5) * (e - w)) / g.cols, lat: n - ((r + 0.5) * (n - s)) / g.rows };
}

/**
 * The app's trip on tap from `from` to `to` with the map leaving `from` at `leaveAt` (on the
 * timetable's own clock: arriving, the reversed one from the destination, at minus the
 * arrival). One pass with legs, a grid of the cells around `to` only (nearRun), the journey to
 * its cell, laterStart when leaving and laterChange. `seconds`: the map's minutes for `to`.
 */
export function appJourney(
  tt: PreparedTimetable,
  from: Origin,
  to: Origin,
  leaveAt: number,
  o: Options,
  depart: boolean,
) {
  const result = travelTimes(tt, from, { trackLegs: true, leaveAt, ...o });
  const reachM = 2 * 900 * (o.walkSpeedMps ?? WALK_MPS) + 100;
  const stopSeconds = Float32Array.from(result.stopSeconds);
  for (let s = 0; s < stopSeconds.length; s++)
    if (distanceM(to.lat, to.lon, tt.stops[s].lat, tt.stops[s].lon) > reachM)
      stopSeconds[s] = Infinity;
  const [col, row] = cellColRow(gridLayout({ cellSizeM: CELL_M }), to.lat, to.lon);
  const window = {
    c0: col - NEAR_CELLS,
    r0: row - NEAR_CELLS,
    cols: 2 * NEAR_CELLS + 1,
    rows: 2 * NEAR_CELLS + 1,
  };
  const best = heatGrid(
    tt,
    { ...result, stopSeconds },
    { cellSizeM: CELL_M, trackStops: true, window, ...o },
  );
  const k = cellAt(best, to.lat, to.lon);
  const seconds = k < 0 ? Infinity : best.seconds[k];
  const found = journeyTo(tt, result, best, to.lat, to.lon);
  if (!found) return null;
  const access = result.legs?.rounds?.access;
  const j = laterChange(
    tt,
    depart && access ? laterStart(tt, found, access, leaveAt) : found,
    leaveAt,
  );
  return { j, seconds };
}
