// S043 check: the map's walk in two passes (walkFrontFringe) against the walk front of a
// routing source folder (main's walkFront), cell by cell, at gridexact's 8 starts on foot and
// by bike: the whole 50 m grid, its minutes and the stop each cell comes from. Prints the
// cells that differ and the median heatGrid time of each. Exits 1 if any cell differs.
// Usage (in packages/routing): tsx bench/fringe.ts <base routing src dir> [runs=3]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { heatGrid, travelTimes } from '../src';
import { liveData, modeOptions } from './live';

const baseDir = process.argv[2];
if (!baseDir) throw new Error('usage: tsx bench/fringe.ts <base routing src dir> [runs]');
const runs = Number(process.argv[3] ?? 3);
const base = (await import(pathToFileURL(resolve(baseDir, 'index.ts')).href)) as {
  heatGrid: typeof heatGrid;
};
const { walk, timetable } = await liveData('.data', true);
const tt = (await timetable('weekday', 10, 'depart', 'weekday-10'))!;
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
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let bad = 0;
for (const mode of ['depart', 'bike'] as const) {
  const o = modeOptions(mode, walk);
  const tb: number[] = [];
  const tn: number[] = [];
  for (const [name, lat, lon] of STARTS) {
    const r = travelTimes(tt, { lat, lon }, { leaveAt: 36000, ...o });
    const opts = { cellSizeM: 50, trackStops: true, ...o };
    let a = base.heatGrid(tt, r, opts);
    let b = heatGrid(tt, r, opts);
    for (let i = 0; i < runs; i++) {
      let t = performance.now();
      a = base.heatGrid(tt, r, opts);
      tb.push(performance.now() - t);
      t = performance.now();
      b = heatGrid(tt, r, opts);
      tn.push(performance.now() - t);
    }
    let diff = 0;
    let stop = 0;
    let worst = 0;
    for (let k = 0; k < a.seconds.length; k++) {
      if (a.seconds[k] !== b.seconds[k]) {
        diff++;
        worst = Math.max(worst, Math.abs(a.seconds[k] - b.seconds[k]));
      } else if (a.stop![k] !== b.stop![k]) stop++;
    }
    bad += diff + stop;
    console.log(
      `${mode} ${name}: ${a.seconds.length} cells, ${diff} differ (worst ${worst.toFixed(1)} s), ${stop} other stop`,
    );
  }
  console.log(
    `${mode}: heatGrid median base ${median(tb).toFixed(0)} ms, this ${median(tn).toFixed(0)} ms`,
  );
}
console.log(bad ? `FAIL: ${bad} cells differ` : 'all cells equal');
process.exit(bad ? 1 : 0);
