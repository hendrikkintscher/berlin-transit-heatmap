// S043: every cell of heatGrid (seconds and stop) from this checkout against another checkout's
// routing src (main's), on foot and by bike for the 8 gridexact starts, with the medians' times.
// Usage (in packages/routing): tsx bench/frontexact.ts <other checkout>/packages/routing/src [rounds=3]
import * as A from '../src';
import { liveData, modeOptions } from './live';
const B = (await import(process.argv[2] + '/index.ts')) as typeof A;
const rounds = Number(process.argv[3] ?? 3);
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
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const mode of ['walk', 'bike'] as const) {
  const o = modeOptions(mode === 'bike' ? 'bike' : 'depart', walk) as Record<string, unknown>;
  let diffS = 0,
    diffN = 0,
    cells = 0,
    maxD = 0;
  const ta: number[] = [],
    tb: number[] = [];
  for (const [name, lat, lon] of STARTS) {
    const r = A.travelTimes(tt, { lat, lon }, { leaveAt: 36000, ...o });
    const opt = { cellSizeM: 50, trackStops: true, ...o };
    B.heatGrid(tt, r, opt);
    A.heatGrid(tt, r, opt); // warm (snaps)
    let ga!: ReturnType<typeof A.heatGrid>, gb!: ReturnType<typeof A.heatGrid>;
    const xa: number[] = [],
      xb: number[] = [];
    for (let i = 0; i < rounds; i++) {
      let t = performance.now();
      gb = B.heatGrid(tt, r, opt);
      xb.push(performance.now() - t);
      t = performance.now();
      ga = A.heatGrid(tt, r, opt);
      xa.push(performance.now() - t);
    }
    ta.push(med(xa));
    tb.push(med(xb));
    let ds = 0,
      dn = 0;
    for (let k = 0; k < ga.seconds.length; k++) {
      if (ga.seconds[k] < Infinity) cells++;
      if (
        ga.seconds[k] !== gb.seconds[k] &&
        !(ga.seconds[k] !== ga.seconds[k] && gb.seconds[k] !== gb.seconds[k])
      ) {
        ds++;
        maxD = Math.max(maxD, Math.abs(ga.seconds[k] - gb.seconds[k]));
      } else if (ga.stop![k] !== gb.stop![k]) dn++;
    }
    diffS += ds;
    diffN += dn;
    console.log(
      `${mode} ${name}: main ${med(xb).toFixed(0)} ms, branch ${med(xa).toFixed(0)} ms, cells differing ${ds} (source only ${dn})`,
    );
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  console.log(
    `${mode} ALL: main ${sum(tb).toFixed(0)} ms, branch ${sum(ta).toFixed(0)} ms; ${cells} reached cells, seconds differ ${diffS} (max ${maxD.toFixed(3)} s), source only ${diffN}`,
  );
}
