// Map to a Ziel with a departure time (roadmap 0.13.5b, 0.13.12): times it against the map
// arriving at the Ziel (today's swapped map), its lines (a pass 40 minutes on, against the
// profile's own legs) and a tap on it (the Ziel's walks found on each tap, against kept per
// map), and checks its minutes against the trips leaving random places at that time, with
// one stop guess per cell and with a second guess (GUESS2 = its window in seconds, default
// 1800; 0 leaves it out). The steps are the web worker's goalRun (worker-runs.ts).
// Usage: tsx bench/goal.ts [places per Ziel, default 300] [seed, default 5]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cellAt,
  decodeTimetable,
  directSeconds,
  goalCells,
  goalUsage,
  goalWindow,
  gridLayout,
  cellColRow,
  heatGrid,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  routeUsage,
  travelTimes,
  tripBetween,
  walksToStops,
  type HeatGrid,
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
// On foot, as the app since 0.13.9 (FASTEST_WALK in worker-runs.ts).
const w = {
  walk,
  walkSpeedMps: 5 / 3.6,
  maxInitialWalkSeconds: 1800,
  maxFallbackWalkSeconds: 1800,
  maxFinalWalkSeconds: 1800,
};
const GUESS2 = Number(process.env.GUESS2 ?? 1800);
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
  /** The map leaving at T; `legs`: its profile keeps each event's leg, for its lines. */
  const leaving = (legs = false, guess2 = 0) => {
    const r = travelTimes(back, Z, {
      profile: { from: -(T + 4200), to: -T },
      arriveBy: -T,
      trackLegs: legs,
      ...w,
    });
    const p = r.profile!;
    // Walking all the way, around the Ziel (as the worker's goalRun).
    const [col, row] = cellColRow(gridLayout({ cellSizeM: 50 }), Z.lat, Z.lon);
    const reach = Math.ceil((900 * w.walkSpeedMps) / 50) + 2;
    const near = { c0: col - reach, r0: row - reach, cols: 2 * reach + 1, rows: 2 * reach + 1 };
    const walkOnly = heatGrid(
      back,
      { ...r, stopSeconds: new Float32Array(r.stopSeconds.length).fill(Infinity) },
      { cellSizeM: 50, window: near, ...w },
    );
    const around = process.env.NOWALK
      ? undefined
      : { grid: walkOnly, c0: Math.max(0, near.c0), r0: Math.max(0, near.r0) };
    const cells = legs ? new Float64Array(p.departure.length) : undefined;
    const make = (wait: number, into?: Float64Array) => {
      const stopSeconds = goalWindow(p, T, T + wait, false);
      const grid = heatGrid(back, { ...r, stopSeconds }, { cellSizeM: 50, trackStops: true, ...w });
      goalCells(grid, stopSeconds, p, T, around, into);
      return grid;
    };
    const grid = make(600, cells);
    if (guess2 > 0) {
      // A second guess of each cell's stop; the cell keeps the quicker.
      const other: HeatGrid = make(guess2);
      for (let k = 0; k < grid.seconds.length; k++)
        if (other.seconds[k] < grid.seconds[k]) grid.seconds[k] = other.seconds[k];
    }
    return { grid, p, cells };
  };
  const a = timed(arriving);
  const l = timed(() => leaving());
  const lLegs = timed(() => leaving(true));
  const l2 = GUESS2 > 0 ? timed(() => leaving(false, GUESS2)) : NaN;
  // Its lines: a pass arriving 40 minutes after leaving (before 0.13.12), or the trips the
  // cells take, from the profile's legs.
  const m = leaving(true);
  const pass = timed(() => {
    const lp = travelTimes(back, Z, { trackLegs: true, leaveAt: -(T + 2400), ...w });
    routeUsage(back, lp, m.grid, { minShare: 0.01 });
  });
  const own = timed(() => goalUsage(back, m.p, m.cells!, m.grid, { minShare: 0.01 }));
  console.log(
    `${Z.name}: arriving map ${a.toFixed(0)} ms, leaving map ${l.toFixed(0)} ms (keeping the legs ${lLegs.toFixed(0)} ms, with a second stop guess ${l2.toFixed(0)} ms); its lines from a pass 40 min on ${pass.toFixed(1)} ms, from the cells' trips ${own.toFixed(1)} ms`,
  );

  // A tap: the trip from a random place to the Ziel leaving at T (the worker's bothWays),
  // the Ziel's walks found on each tap or kept per map, and the first search bounded by the
  // map's minutes plus 15 (arriveByHint); against a tap on the arriving map.
  const map = leaving().grid;
  const zielWalks = walksToStops(fwd, Z, w);
  const arrivePass = travelTimes(back, Z, {
    leaveAt: -(raw.windowEnd + 1800),
    trackLegs: true,
    ...w,
  });
  const taps = Array.from({ length: 40 }, () => ({
    lon: 13.2 + rnd() * 0.4,
    lat: 52.43 + rnd() * 0.17,
  }));
  const perTap = (f: (X: { lat: number; lon: number }) => void) =>
    timed(() => taps.forEach(f)) / taps.length;
  const tapWalked = perTap((X) => tripBetween(fwd, back, X, Z, { leave: T }, w));
  const tapKept = perTap((X) =>
    tripBetween(fwd, back, X, Z, { leave: T }, { ...w, toWalks: zielWalks }),
  );
  const tapHint = perTap((X) => {
    const hint = T + map.seconds[cellAt(map, X.lat, X.lon)]! + 900;
    const o = { ...w, toWalks: zielWalks, ...(hint < Infinity ? { arriveByHint: hint } : {}) };
    tripBetween(fwd, back, X, Z, { leave: T }, o);
  });
  let same = 0;
  for (const X of taps) {
    const hint = T + map.seconds[cellAt(map, X.lat, X.lon)]! + 900;
    const o = { ...w, toWalks: zielWalks, ...(hint < Infinity ? { arriveByHint: hint } : {}) };
    const x = tripBetween(fwd, back, X, Z, { leave: T }, o);
    const y = tripBetween(fwd, back, X, Z, { leave: T }, w);
    if (x?.arrive === y?.arrive && x?.leave === y?.leave) same++;
  }
  const tapArrive = perTap((X) =>
    tripBetween(
      fwd,
      back,
      X,
      Z,
      { arrive: raw.windowEnd + 1800 },
      { ...w, toWalks: zielWalks },
      arrivePass,
    ),
  );
  console.log(
    `  tap: ${tapWalked.toFixed(1)} ms, the Ziel's walks kept ${tapKept.toFixed(1)} ms, and bounded by the map ${tapHint.toFixed(1)} ms (same leaving and arrival in ${same} of ${taps.length}); arriving map's tap ${tapArrive.toFixed(1)} ms`,
  );

  // The minutes against the trip leaving each place at T, one stop guess and two.
  const grids = [leaving().grid, ...(GUESS2 > 0 ? [leaving(false, GUESS2).grid] : [])];
  const toWalks = zielWalks;
  const diffs: number[][] = grids.map(() => []);
  const missing = grids.map(() => 0);
  const box = [13.2, 52.43, 13.6, 52.6];
  for (let n = 0; n < N;) {
    const X = {
      lon: box[0]! + rnd() * (box[2]! - box[0]!),
      lat: box[1]! + rnd() * (box[3]! - box[1]!),
    };
    const k = cellAt(grids[0]!, X.lat, X.lon);
    if (k < 0) continue;
    const r = travelTimes(fwd, X, { leaveAt: T, ...w });
    let trip = directSeconds(X, Z, w);
    for (let s = 0; s < toWalks.length; s++) trip = Math.min(trip, r.stopSeconds[s]! + toWalks[s]!);
    if (trip > 3500 && grids[0]!.seconds[k]! > 3500) continue;
    n++;
    grids.forEach((g, i) => {
      const map = g.seconds[k]!;
      if (map === Infinity || trip === Infinity) missing[i]!++;
      else diffs[i]!.push(Math.abs(map - trip) / 60);
    });
  }
  grids.forEach((_, i) => {
    const d = diffs[i]!;
    const share = (f: (d: number) => boolean) => ((100 * d.filter(f).length) / d.length).toFixed(0);
    console.log(
      `  ${N} places, ${i ? 'two stop guesses' : 'one stop guess'}: within 1 min ${share((d) => d <= 1)} %, 3 min or more apart ${share((d) => d >= 3)} %, reached by only one of map and trip ${missing[i]}`,
    );
  });
}
