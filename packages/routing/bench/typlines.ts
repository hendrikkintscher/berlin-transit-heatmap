// Typisch lines on a map to a Ziel leaving (step S002): today's lines (a pass arriving 40
// minutes after the hour starts) against lines from the cells' own trips over the hour, and
// how well each set covers the trips on tap from random places. The steps are the worker's
// goalRun (worker-runs.ts) for measure 'typical'.
//   today  : profile without legs, Typisch grid, then a pass arriving by from + 40 min (routeUsage)
//   hour   : profile with legs; each cell weighs every event of its stop by the share of the
//            hour it serves (leaving after the cell's walk), goalUsage
//   mode   : profile with legs; each cell takes its stop's event serving the most of the hour
//   start  : profile with legs; each cell takes the vehicle caught leaving at the hour's start
// Usage: tsx bench/typlines.ts [places per Ziel, default 300] [seed, default 7]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cellAt,
  goalUsage,
  goalWindow,
  heatGrid,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  routeUsage,
  travelTimes,
  tripBetween,
  walksToStops,
  type HeatGrid,
  type StopProfile,
  type UsedSegment,
} from '../src/index';
import { DATA_DIR, readTimetable } from './data';

const N = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const raw = await readTimetable('day');
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
const wb = readFileSync(join(DATA_DIR, 'walk.bin'));
const walk = loadWalkNetwork(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
const w = {
  walk,
  walkSpeedMps: 5 / 3.6,
  maxInitialWalkSeconds: 1800,
  maxFallbackWalkSeconds: 1800,
  maxFinalWalkSeconds: 1800,
};
const ZIELE = [
  { name: 'Alexanderplatz', lat: 52.5219, lon: 13.4132 },
  { name: 'Spandau Rathaus', lat: 52.5354, lon: 13.1998 },
  { name: 'Köpenick', lat: 52.4583, lon: 13.5815 },
  { name: 'Zoo', lat: 52.5069, lon: 13.3323 },
  { name: 'Hermannplatz', lat: 52.4869, lon: 13.4246 },
];
// As goalRun: the hour of the reversed file, Typisch looking 45 minutes beyond it.
const from = -back.windowEnd - 3600;
const LINES_S = Number(process.env.LINES_S ?? 2400);
const to = from + 3600;
const span = 3600 + 2700;
const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1]!;
const timed = (f: () => void) => {
  f();
  const ms: number[] = [];
  for (let i = 0; i < 9; i++) {
    const t = performance.now();
    f();
    ms.push(performance.now() - t);
  }
  return median(ms);
};
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)} %`;

type Variant = 'today' | 'hour' | 'hourStop' | 'mode' | 'start';
const VARIANTS: Variant[] = process.env.ONLY
  ? (process.env.ONLY.split(',') as Variant[])
  : ['today', 'hour', 'hourStop', 'mode', 'start'];

/** The first event of stop s allowing leaving at `leave` or later (as goal.ts). */
function firstAllowing(p: StopProfile, s: number, leave: number): number {
  let lo = p.offset[s]!;
  let hi = p.offset[s + 1]!;
  const end = hi;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (-p.arrival[mid]! >= leave) hi = mid;
    else lo = mid + 1;
  }
  return lo < end ? lo : -1;
}

/** Typisch map and its lines, as goalRun would make them with variant `v`. */
function typMap(Z: { lat: number; lon: number }, v: Variant) {
  const legs = v !== 'today';
  const found = travelTimes(back, Z, {
    profile: { from: -(from + span), to: -from },
    arriveBy: -from,
    trackLegs: legs,
    ...w,
  });
  const p = found.profile!;
  const stopSeconds = goalWindow(p, from, to, true);
  const grid: HeatGrid = heatGrid(
    back,
    { ...found, stopSeconds },
    { cellSizeM: 50, trackStops: true, ...w },
  );
  const tl = performance.now();
  const out = linesOf();
  lineMs[v] = performance.now() - tl;
  return out;
  function linesOf() {
    if (v === 'today') {
      const r = travelTimes(back, Z, { trackLegs: true, leaveAt: -(from + LINES_S), ...w });
      return { grid, used: routeUsage(back, r, grid, { minShare: 0.01 }) };
    }
    const cells = new Float64Array(p.departure.length);
    const stop = grid.stop!;
    if (v === 'hourStop') {
      // Per stop: its cells spread over its events by the share of the hour each serves.
      const per = new Float64Array(back.stopCount);
      for (let k = 0; k < stop.length; k++)
        if (stop[k]! >= 0 && grid.seconds[k]! < Infinity) per[stop[k]!]++;
      for (let s = 0; s < per.length; s++) {
        if (per[s] === 0) continue;
        let before = -Infinity;
        for (let i = p.offset[s]!; i < p.offset[s + 1]!; i++) {
          const reach = -p.arrival[i]!;
          const len = Math.min(reach, to) - Math.max(before, from);
          before = reach;
          if (len > 0) cells[i] = (per[s]! * len) / 3600;
        }
      }
      return { grid, used: goalUsage(back, p, cells, grid, { minShare: 0.01 }) };
    }
    const modeOf = v === 'mode' ? new Int32Array(back.stopCount).fill(-2) : undefined;
    for (let k = 0; k < stop.length; k++) {
      const s = stop[k]!;
      if (s < 0 || !(grid.seconds[k]! < Infinity)) continue;
      const walkS = grid.seconds[k]! - stopSeconds[s]!;
      if (v === 'start') {
        const e = firstAllowing(p, s, from + walkS);
        if (e >= 0) cells[e]++;
        continue;
      }
      // Leaving the cell in [from, to] is leaving the stop in [from + walk, to + walk].
      const a0 = from + walkS;
      const b0 = to + walkS;
      if (v === 'mode') {
        // Per stop (not per cell): the event serving the most of the hour, walk left out.
        if (modeOf![s] === -2) {
          let best = -1;
          let most = 0;
          let before = -Infinity;
          for (let i = p.offset[s]!; i < p.offset[s + 1]!; i++) {
            const reach = -p.arrival[i]!;
            const len = Math.min(reach, to) - Math.max(before, from);
            before = reach;
            if (len > most) [most, best] = [len, i];
          }
          modeOf![s] = best;
        }
        if (modeOf![s]! >= 0) cells[modeOf![s]!]++;
        continue;
      }
      let before = -Infinity;
      let covered = 0;
      const first = p.offset[s]!;
      const share: number[] = [];
      for (let i = first; i < p.offset[s + 1]!; i++) {
        const reach = -p.arrival[i]!;
        const len = Math.min(reach, b0) - Math.max(before, a0);
        before = reach;
        share.push(len > 0 ? len : 0);
        if (len > 0) covered += len;
      }
      if (covered > 0) share.forEach((x, j) => x > 0 && (cells[first + j]! += x / covered));
    }
    return { grid, used: goalUsage(back, p, cells, grid, { minShare: 0.01 }) };
  }
}
const lineMs: Record<string, number> = {};

/** Ridden hops of a trip as unordered stop pairs, with the line's name. */
function hops(j: NonNullable<ReturnType<typeof tripBetween>>['journey']) {
  const out: { key: string; name: string }[] = [];
  for (const l of j.legs) {
    if (l.type !== 'ride') continue;
    for (let i = 0; i + 1 < l.stops.length; i++) {
      const [a, b] = [l.stops[i]!, l.stops[i + 1]!];
      if (a !== b) out.push({ key: a < b ? `${a}-${b}` : `${b}-${a}`, name: l.name });
    }
  }
  return out;
}

if (process.env.LEGS) {
  for (const Z of ZIELE) {
    const a: number[] = [];
    const b: number[] = [];
    for (let round = 0; round < 21; round++) {
      for (const legs of [false, true]) {
        const t0 = performance.now();
        travelTimes(back, Z, {
          profile: { from: -(from + span), to: -from },
          arriveBy: -from,
          trackLegs: legs,
          ...w,
        });
        (legs ? b : a).push(performance.now() - t0);
      }
    }
    console.log(
      `${Z.name}: profile ${median(a.slice(3)).toFixed(1)} ms, keeping legs ${median(b.slice(3)).toFixed(1)} ms`,
    );
  }
  process.exit(0);
}
if (process.env.DELTA) {
  // Interleaved: the whole Typisch map with today's lines against hourStop, 15 rounds.
  for (const Z of ZIELE) {
    const a: number[] = [];
    const b: number[] = [];
    const la: number[] = [];
    const lb: number[] = [];
    for (let round = 0; round < 17; round++) {
      let t0 = performance.now();
      typMap(Z, 'today');
      a.push(performance.now() - t0);
      la.push(lineMs.today!);
      t0 = performance.now();
      typMap(Z, 'hourStop');
      b.push(performance.now() - t0);
      lb.push(lineMs.hourStop!);
    }
    const m = (x: number[]) => median(x.slice(2));
    console.log(
      `${Z.name}: today ${m(a).toFixed(0)} ms (lines ${m(la).toFixed(1)}), hourStop ${m(b).toFixed(0)} ms (lines ${m(lb).toFixed(1)})`,
    );
  }
  process.exit(0);
}
if (process.env.PARTS) {
  for (const Z of ZIELE) {
    const t: Record<string, number[]> = {
      noLegs: [],
      legs: [],
      pass: [],
      todayLines: [],
      startLines: [],
    };
    for (let round = 0; round < 9; round++) {
      let t0 = performance.now();
      travelTimes(back, Z, { profile: { from: -(from + span), to: -from }, arriveBy: -from, ...w });
      t.noLegs!.push(performance.now() - t0);
      t0 = performance.now();
      travelTimes(back, Z, {
        profile: { from: -(from + span), to: -from },
        arriveBy: -from,
        trackLegs: true,
        ...w,
      });
      t.legs!.push(performance.now() - t0);
      t0 = performance.now();
      travelTimes(back, Z, { trackLegs: true, leaveAt: -(from + 2400), ...w });
      t.pass!.push(performance.now() - t0);
      t0 = performance.now();
      typMap(Z, 'today');
      t.todayLines!.push(lineMs.today!);
      typMap(Z, 'start');
      t.startLines!.push(lineMs.start!);
      typMap(Z, 'hour');
      (t.hourLines ??= []).push(lineMs.hour!);
      typMap(Z, 'hourStop');
      (t.hourStopLines ??= []).push(lineMs.hourStop!);
      typMap(Z, 'mode');
      (t.modeLines ??= []).push(lineMs.mode!);
    }
    console.log(
      Z.name,
      Object.entries(t)
        .map(([k, v]) => `${k} ${median(v.slice(2)).toFixed(0)}`)
        .join(', '),
    );
  }
  process.exit(0);
}
const totals = Object.fromEntries(
  VARIANTS.map((v) => [
    v,
    {
      ms: [] as number[],
      hopsOn: 0,
      hops: 0,
      whole: 0,
      drawn: 0,
      ridden: 0,
      drawnW: 0,
      riddenW: 0,
      wholeHour: 0,
      wholeHourOk: 0,
    },
  ]),
) as Record<
  Variant,
  {
    ms: number[];
    hopsOn: number;
    hops: number;
    whole: number;
    drawn: number;
    ridden: number;
    drawnW: number;
    riddenW: number;
    wholeHour: number;
    wholeHourOk: number;
  }
>;
let tripsAll = 0;
let ridesAll = 0;

for (const Z of ZIELE) {
  const made = Object.fromEntries(VARIANTS.map((v) => [v, typMap(Z, v)])) as Record<
    Variant,
    ReturnType<typeof typMap>
  >;
  for (const v of VARIANTS) totals[v].ms.push(timed(() => typMap(Z, v)));
  const zielWalks = walksToStops(fwd, Z, w);
  // Trips on tap: from random places the map reaches within an hour, leaving on the hour
  // (a chosen hour) or at a random minute of it (the current hour).
  const tapHops: ReturnType<typeof hops>[] = [];
  const onHour: boolean[] = [];
  const grid = made.today.grid;
  for (let n = 0, tries = 0; n < N && tries < 20 * N; tries++) {
    const X = { lon: 13.1 + rnd() * 0.65, lat: 52.38 + rnd() * 0.27 };
    const k = cellAt(grid, X.lat, X.lon);
    if (k < 0 || !(grid.seconds[k]! < 3600)) continue;
    const leave = from + (n % 2 === 0 ? 0 : Math.floor(rnd() * 3600));
    const t = tripBetween(fwd, back, X, Z, { leave }, { ...w, toWalks: zielWalks });
    if (!t) continue;
    n++;
    tripsAll++;
    const h = hops(t.journey);
    if (h.length === 0) continue;
    ridesAll++;
    tapHops.push(h);
    onHour.push(n % 2 === 1);
  }
  // Every hop any tap trip rides, by line name.
  const ridden = new Map<string, Set<string>>();
  for (const h of tapHops)
    for (const x of h) {
      if (!ridden.has(x.key)) ridden.set(x.key, new Set());
      ridden.get(x.key)!.add(x.name);
    }
  const row: string[] = [];
  for (const v of VARIANTS) {
    const drawn = new Map<string, UsedSegment>();
    for (const u of made[v].used) drawn.set(`${u.a}-${u.b}`, u);
    const T = totals[v];
    let on = 0;
    let all = 0;
    let whole = 0;
    tapHops.forEach((h, i) => {
      let ok = 0;
      for (const x of h) if (drawn.get(x.key)?.names.includes(x.name)) ok++;
      on += ok;
      all += h.length;
      if (ok === h.length) whole++;
      if (onHour[i]) T.wholeHour++;
      if (onHour[i] && ok === h.length) T.wholeHourOk++;
    });
    T.hopsOn += on;
    T.hops += all;
    T.whole += whole;
    // Drawn hops (weighted by the cells over them) that some tap trip rides on that line.
    let dW = 0;
    let rW = 0;
    let rN = 0;
    for (const u of made[v].used) {
      dW += u.cells;
      const r = ridden.get(`${u.a}-${u.b}`);
      if (r && u.names.some((nm) => r.has(nm))) {
        rW += u.cells;
        rN++;
      }
    }
    T.drawn += made[v].used.length;
    T.ridden += rN;
    T.drawnW += dW;
    T.riddenW += rW;
    row.push(
      `${v}: ${made[v].used.length} hops, tap hops on them ${pct(on, all)}, whole trips ${pct(whole, tapHops.length)}, drawn ridden ${pct(rW, dW)}, ${totals[v].ms.at(-1)!.toFixed(0)} ms`,
    );
  }
  console.log(`${Z.name} (${tapHops.length} trips with rides)\n  ${row.join('\n  ')}`);
}
console.log(`\nAll Ziele (${tripsAll} trips, ${ridesAll} with rides):`);
for (const v of VARIANTS) {
  const T = totals[v];
  console.log(
    `  ${v}: map + lines ${median(T.ms).toFixed(0)} ms (median of Ziele: ${T.ms.map((x) => x.toFixed(0)).join('/')}), ${T.drawn} hops drawn, tap hops on drawn lines ${pct(T.hopsOn, T.hops)}, tap trips wholly on them ${pct(T.whole, ridesAll)} (leaving on the hour ${pct(T.wholeHourOk, T.wholeHour)}, at a random minute ${pct(T.whole - T.wholeHourOk, ridesAll - T.wholeHour)}), drawn weight ridden by taps ${pct(T.riddenW, T.drawnW)}`,
  );
}
