// S041 measurement: how much of the map the walk blocking in walkFrom affects. For 8 starts
// across the region, 150 random reachable cells each, the full heatGrid against the exact
// value (the least over each nearby stop's own grid, which nothing can block, and the start's
// own walk). Result 2026-11-06 on weekday-10: 0.8 % of cells 1+ min too late, 0.5 % 5+ min,
// up to 21 min; none earlier. Takes about 2 minutes.
// Usage (in packages/routing): tsx bench/gridexact.ts [file=weekday-10] [leave seconds=36000]
// How much of the map the S041 blocking affects: full grid vs the exact value (min over each
// nearby stop's own grid, and the start's own walk), at random reachable cells.
import { cellColRow, distanceM, gridLayout, heatGrid, travelTimes } from '../src';
import { liveData, modeOptions } from './live';
const file = process.argv[2] ?? 'weekday-10';
const leave = Number(process.argv[3] ?? 36000);
const { walk, timetable } = await liveData('.data', true);
const tt = (await timetable('weekday', 10, 'depart', file))!;
const o = modeOptions('depart', walk);
const layout = gridLayout({ cellSizeM: 50 });
const [w, s, e, n] = layout.bbox;
const centre = (k: number) => ({
  lat: n - ((Math.floor(k / layout.cols) + 0.5) * (n - s)) / layout.rows,
  lon: w + (((k % layout.cols) + 0.5) * (e - w)) / layout.cols,
});
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
let seed = 41;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const all: number[] = [];
const t0 = performance.now();
for (const [name, lat, lon] of STARTS) {
  const from = { lat, lon };
  const r = travelTimes(tt, from, { leaveAt: leave, ...o });
  const g = heatGrid(tt, r, { cellSizeM: 50, ...o });
  const reach: number[] = [];
  for (let k = 0; k < g.seconds.length; k++) if (g.seconds[k] < 7200) reach.push(k);
  const diffs: number[] = [];
  for (let i = 0; i < 150; i++) {
    const k = reach[Math.floor(rnd() * reach.length)];
    const p = centre(k);
    const [c, rw] = cellColRow(layout, p.lat, p.lon);
    const win = { c0: c, r0: rw, cols: 1, rows: 1 };
    const none = new Float32Array(tt.stopCount).fill(Infinity);
    // The start's own walk.
    let exact = heatGrid(tt, { ...r, stopSeconds: none }, { cellSizeM: 50, window: win, ...o })
      .seconds[0];
    for (let st = 0; st < tt.stopCount; st++) {
      if (!(r.stopSeconds[st] < Infinity)) continue;
      if (distanceM(p.lat, p.lon, tt.stops[st].lat, tt.stops[st].lon) > 2600) continue;
      const only = Float32Array.from(none);
      only[st] = r.stopSeconds[st];
      const v = heatGrid(
        tt,
        { ...r, stopSeconds: only, origin: undefined },
        { cellSizeM: 50, window: win, ...o },
      ).seconds[0];
      if (v < exact) exact = v;
    }
    diffs.push(g.seconds[k] - exact);
  }
  const bad = diffs.filter((d) => d >= 60);
  console.log(
    `${name}: ${bad.length} of ${diffs.length} cells 1+ min too late; 5+ min: ${diffs.filter((d) => d >= 300).length}; max ${Math.round(Math.max(...diffs) / 60)} min; any earlier than exact: ${diffs.filter((d) => d < -1).length}`,
  );
  all.push(...diffs);
}
const pct = (x: number) => ((100 * x) / all.length).toFixed(1);
console.log(
  `ALL ${all.length} cells: 1+ min too late ${pct(all.filter((d) => d >= 60).length)} %, 3+ min ${pct(all.filter((d) => d >= 180).length)} %, 5+ min ${pct(all.filter((d) => d >= 300).length)} %; ${Math.round((performance.now() - t0) / 1000)} s`,
);
