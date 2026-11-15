// S044 check: walking on the junction graph (shape nodes folded into chains) against a
// routing source folder (main's), at gridexact's 8 starts on foot and by bike: travelTimes'
// stop times (the access walk on tap, leaving at 10:00, and the typical map's pass) and the
// whole 50 m heatGrid, its seconds and the stop each cell comes from. Prints what differs and
// the median times of each. Exits 1 if anything differs by more than float rounding (1 ms).
// Also the first map with the footpaths, made before the chains are built: its cells must be
// main's exactly, by bike too.
// Usage (in packages/routing): tsx bench/chains.ts <base routing src dir> [runs=3]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { heatGrid, loadWalkNetwork, travelTimes } from '../src';
import { liveData, modeOptions } from './live';
import { readFileSync } from 'node:fs';

const baseDir = process.argv[2];
if (!baseDir) throw new Error('usage: tsx bench/chains.ts <base routing src dir> [runs]');
const runs = Number(process.argv[3] ?? 3);
const base = (await import(pathToFileURL(resolve(baseDir, 'index.ts')).href)) as {
  heatGrid: typeof heatGrid;
  travelTimes: typeof travelTimes;
  loadWalkNetwork: typeof loadWalkNetwork;
};
const { walk, timetable } = await liveData('.data', true);
const tt = (await timetable('weekday', 10, 'depart', 'weekday-10'))!;
// Each side walks its own network object (main's has no chains).
const bin = readFileSync('.data/walk.bin');
const baseWalk = base.loadWalkNetwork(bin);
const plainWalk = loadWalkNetwork(bin, false);
const STARTS = [
  ['Alexanderplatz', 52.5219, 13.4132],
  ['Spandau', 52.5354, 13.1998],
  ['Köpenick', 52.4583, 13.5815],
  ['Zehlendorf', 52.4313, 13.2589],
  ['Pankow', 52.5671, 13.412],
  ['Marzahn', 52.545, 13.559],
  ['Potsdam Hbf', 52.3917, 13.0668],
  ['Bernau', 52.676, 13.589],
] as const;
const TOL = 1e-3;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const timed = <T>(f: () => T, into: number[]): T => {
  const t = performance.now();
  const r = f();
  into.push(performance.now() - t);
  return r;
};
let bad = 0;
const lt: number[] = [];
const ln: number[] = [];
for (let i = 0; i < runs; i++) {
  timed(() => base.loadWalkNetwork(bin), lt);
  timed(() => loadWalkNetwork(bin), ln);
}
console.log(
  `load walk.bin: median base ${median(lt).toFixed(0)} ms, this ${median(ln).toFixed(0)} ms`,
);
for (const mode of ['depart', 'bike'] as const) {
  const ob = modeOptions(mode, baseWalk);
  const on = modeOptions(mode, walk);
  const op = modeOptions(mode, plainWalk);
  const t = {
    tapB: [] as number[],
    tapN: [] as number[],
    mapB: [] as number[],
    mapN: [] as number[],
  };
  const gb: number[] = [];
  const gn: number[] = [];
  for (const [name, lat, lon] of STARTS) {
    const o = { lat, lon };
    // The tap's pass (leaving at a time) and the typical map's.
    let stopDiff = 0;
    let stopWorst = 0;
    let rb = base.travelTimes(tt, o, { leaveAt: 36000, ...ob });
    let rn = travelTimes(tt, o, { leaveAt: 36000, ...on });
    for (let i = 0; i < runs; i++) {
      rb = timed(() => base.travelTimes(tt, o, { leaveAt: 36000, ...ob }), t.tapB);
      rn = timed(() => travelTimes(tt, o, { leaveAt: 36000, ...on }), t.tapN);
    }
    const mb = base.travelTimes(tt, o, { typical: true, trackLegs: true, ...ob });
    const mn = travelTimes(tt, o, { typical: true, trackLegs: true, ...on });
    for (const [x, y] of [
      [rb.stopSeconds, rn.stopSeconds],
      [mb.typicalSeconds!, mn.typicalSeconds!],
    ])
      for (let s = 0; s < x.length; s++)
        if (x[s] !== y[s] && !(Math.abs(x[s] - y[s]) <= TOL)) {
          stopDiff++;
          stopWorst = Math.max(stopWorst, Math.abs(x[s] - y[s]));
        }
    const optsB = { cellSizeM: 50, trackStops: true, ...ob };
    const optsN = { cellSizeM: 50, trackStops: true, ...on };
    let a = base.heatGrid(tt, rb, optsB);
    let b = heatGrid(tt, rb, optsN);
    for (let i = 0; i < runs; i++) {
      a = timed(() => base.heatGrid(tt, rb, optsB), gb);
      b = timed(() => heatGrid(tt, rb, optsN), gn);
    }
    // Before the chains: main's map, cell for cell.
    const p = heatGrid(tt, rb, { cellSizeM: 50, trackStops: true, ...op });
    let plain = 0;
    for (let k = 0; k < a.seconds.length; k++)
      if (a.seconds[k] !== p.seconds[k] || a.stop![k] !== p.stop![k]) plain++;
    bad += plain;
    let diff = 0;
    let bits = 0;
    let stop = 0;
    let worst = 0;
    let better = 0;
    for (let k = 0; k < a.seconds.length; k++) {
      const d = Math.abs(a.seconds[k] - b.seconds[k]);
      if (a.seconds[k] === b.seconds[k]) {
        if (a.stop![k] !== b.stop![k]) stop++;
      } else if (d <= TOL) bits++;
      else {
        diff++;
        if (b.seconds[k] < a.seconds[k]) better++;
        worst = Math.max(
          worst,
          a.seconds[k] === Infinity || b.seconds[k] === Infinity ? Infinity : d,
        );
      }
    }
    bad += diff + stop + stopDiff;
    console.log(
      `${mode} ${name}: before the chains ${plain} cells differ; ` +
        `stops ${stopDiff} differ (worst ${stopWorst.toFixed(1)} s); ` +
        `${a.seconds.length} cells, ${diff} differ (worst ${worst.toFixed(1)} s), ` +
        `${bits} by float rounding, ${stop} other stop` +
        (diff ? `; ${better} of the ${diff} earlier here` : ''),
    );
  }
  console.log(
    `${mode}: medians base → this: travelTimes leaving at 10:00 ${median(t.tapB).toFixed(1)} → ` +
      `${median(t.tapN).toFixed(1)} ms, heatGrid ${median(gb).toFixed(0)} → ${median(gn).toFixed(0)} ms`,
  );
}
console.log(bad ? `FAIL: ${bad} cells or stops differ` : 'all cells and stops equal');
process.exit(bad ? 1 : 0);
