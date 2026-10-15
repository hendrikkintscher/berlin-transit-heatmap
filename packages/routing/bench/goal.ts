// Map to a Ziel with a departure time (roadmap 0.13.5b): times it against the map arriving at
// the Ziel (today's swapped map) and checks its minutes against the trips leaving random
// places at that time. The steps are the web worker's goalRun (worker-runs.ts).
// Usage: tsx bench/goal.ts [places per Ziel, default 300] [seed, default 5]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cellAt,
  decodeTimetable,
  directSeconds,
  goalCells,
  goalWindow,
  gridLayout,
  cellColRow,
  heatGrid,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  travelTimes,
  walksToStops,
  type Timetable,
} from '../src/index';
import { DATA_DIR, TIMETABLE_FILES } from './data';

const N = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 5);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const raw = decodeTimetable(readFileSync(join(DATA_DIR, TIMETABLE_FILES.day))) as Timetable;
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
const wb = readFileSync(join(DATA_DIR, 'walk.bin'));
const walk = loadWalkNetwork(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
const w = { walk, walkSpeedMps: 5 / 3.6 };
const ZIELE = [
  { name: 'Alexanderplatz', lat: 52.5219, lon: 13.4132 },
  { name: 'Spandau Rathaus', lat: 52.5354, lon: 13.1998 },
  { name: 'Köpenick', lat: 52.4583, lon: 13.5815 },
];
// Leaving at 10:57, as in the roadmap's example.
const T = raw.windowStart + 3420;
const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1]!;
const timed = (f: () => void) => {
  f();
  const ms: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    f();
    ms.push(performance.now() - t);
  }
  return median(ms);
};

for (const Z of ZIELE) {
  // Today's swapped map: arriving at the Ziel (one pass backwards, then the grid).
  const arriving = () => {
    const r = travelTimes(back, Z, { trackLegs: true, leaveAt: -(raw.windowEnd + 1800), ...w });
    heatGrid(back, r, { cellSizeM: 50, trackStops: true, ...w });
  };
  const leaving = () => {
    const r = travelTimes(back, Z, { profile: { from: -(T + 4200), to: -T }, arriveBy: -T, ...w });
    const stopSeconds = goalWindow(r.profile!, T, T + 600, false);
    const grid = heatGrid(back, { ...r, stopSeconds }, { cellSizeM: 50, trackStops: true, ...w });
    // Walking all the way, around the Ziel (as the worker's goalRun).
    const [col, row] = cellColRow(gridLayout({ cellSizeM: 50 }), Z.lat, Z.lon);
    const reach = Math.ceil((900 * w.walkSpeedMps) / 50) + 2;
    const near = { c0: col - reach, r0: row - reach, cols: 2 * reach + 1, rows: 2 * reach + 1 };
    const walkOnly = heatGrid(
      back,
      { ...r, stopSeconds: new Float32Array(stopSeconds.length).fill(Infinity) },
      { cellSizeM: 50, window: near, ...w },
    );
    goalCells(
      grid,
      stopSeconds,
      r.profile!,
      T,
      process.env.NOWALK
        ? undefined
        : { grid: walkOnly, c0: Math.max(0, near.c0), r0: Math.max(0, near.r0) },
    );
    return grid;
  };
  const a = timed(arriving);
  const l = timed(leaving);
  console.log(`${Z.name}: arriving map ${a.toFixed(0)} ms, leaving map ${l.toFixed(0)} ms`);

  // The minutes against the trip leaving each place at T.
  const grid = leaving();
  const toWalks = walksToStops(fwd, Z, w);
  const diffs: number[] = [];
  let missing = 0;
  const box = [13.2, 52.43, 13.6, 52.6];
  for (let n = 0; n < N;) {
    const X = {
      lon: box[0]! + rnd() * (box[2]! - box[0]!),
      lat: box[1]! + rnd() * (box[3]! - box[1]!),
    };
    const k = cellAt(grid, X.lat, X.lon);
    if (k < 0) continue;
    const r = travelTimes(fwd, X, { leaveAt: T, ...w });
    let trip = directSeconds(X, Z, w);
    for (let s = 0; s < toWalks.length; s++) trip = Math.min(trip, r.stopSeconds[s]! + toWalks[s]!);
    const map = grid.seconds[k]!;
    if (trip > 3500 && map > 3500) continue;
    n++;
    if (map === Infinity || trip === Infinity) missing++;
    else diffs.push(Math.abs(map - trip) / 60);
  }
  const share = (f: (d: number) => boolean) =>
    ((100 * diffs.filter(f).length) / diffs.length).toFixed(0);
  console.log(
    `  ${N} places: within 1 min ${share((d) => d <= 1)} %, 3 min or more apart ${share((d) => d >= 3)} %, reached by only one of map and trip ${missing}`,
  );
}
