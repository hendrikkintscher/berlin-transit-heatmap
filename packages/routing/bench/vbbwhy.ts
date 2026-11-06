// S042 measurement: why VBB's trip is 3+ min better than the app's, for the suite's cases.
// VBB's own trip (from the planners' cache) is replayed leg by leg in the app's model on the
// exact platforms of the app's vehicles: start walk, change times (the timetable's footpaths),
// end walk, or a ride the app's file does not have. Needs a suite run with --vbb first.
// Usage (in packages/routing): tsx bench/vbbwhy.ts [suite-depart|suite-modes]
//   (reads ../../work/<name>/cases.jsonl, as bench/suite.ts --out ../../work/<name> writes it)
// Why VBB's trip is 3+ min better: VBB's own trip leg by leg in the app's model, on the
// exact platforms of the app's vehicles.
import { readFileSync } from 'node:fs';
import { walksToStops, type PreparedTimetable } from '../src';
import { cellCentre, dayStartMs, liveData, modeOptions, type Mode } from './live';
import { vbb } from './planners';
const file = process.argv[2] ?? 'suite-depart';
const { walk, timetable } = await liveData();
const C = readFileSync(`../../work/${file}/cases.jsonl`, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));
const norm = (s: string) => s.replace(/ \[.*?\]/g, '').trim();
const hm = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
/** The app's vehicle for a VBB ride: its from and to stop indices. */
function vehicle(
  tt: PreparedTimetable,
  r: { line: string; from: string; to: string; dep: number; arr: number },
) {
  let best: { a: number; b: number; err: number } | null = null;
  for (let ro = 0; ro < tt.routeTripCount.length; ro++) {
    if (tt.routeNames[ro] !== r.line) continue;
    const off = tt.routeStopOffset[ro];
    const n = tt.routeStopOffset[ro + 1] - off;
    for (let i = 0; i < n; i++) {
      if (norm(tt.stops[tt.routeStops[off + i]].name) !== norm(r.from)) continue;
      for (let j = i + 1; j < n; j++) {
        if (norm(tt.stops[tt.routeStops[off + j]].name) !== norm(r.to)) continue;
        for (let k = 0; k < tt.routeTripCount[ro]; k++) {
          const row = tt.routeTimeOffset[ro] + k * n;
          const err = Math.abs(tt.times[row + i] - r.dep) + Math.abs(tt.arrivals[row + j] - r.arr);
          if (err <= 120 && (!best || err < best.err))
            best = { a: tt.routeStops[off + i], b: tt.routeStops[off + j], err };
        }
      }
    }
  }
  return best;
}
const tally: Record<string, number[]> = {};
const ex: Record<string, string[]> = {};
for (const c of C) {
  if (!c.vbb || c.mode === 'bike') continue;
  const better =
    c.mode === 'arrive' ? c.vbb.leave - c.leave >= 180 : c.arrive - c.vbb.arrive >= 180;
  if (!better) continue;
  const mode = c.mode as Mode;
  const o = modeOptions(mode, walk);
  const day0 = dayStartMs(c.date);
  const trips = await vbb(c.from, c.to, day0 + c.at * 1000, day0, {
    arrive: mode === 'arrive',
    stepFree: mode === 'stepfree',
  });
  const v =
    mode === 'arrive'
      ? trips.filter((t) => t.arrive <= c.at + 60).sort((a, b) => b.depart - a.depart)[0]
      : trips.sort((a, b) => a.arrive - b.arrive)[0];
  const gain = Math.round(
    (mode === 'arrive' ? c.vbb.leave - c.leave : c.arrive - c.vbb.arrive) / 60,
  );
  let why = '';
  let tt: PreparedTimetable | null = null;
  if (!v?.rides.length) why = 'VBB walks all the way';
  else
    tt = await timetable(
      c.date,
      Math.min(23, Math.floor(v.rides[0].dep / 3600)),
      mode === 'arrive' ? 'depart' : mode,
    );
  const veh = tt ? v!.rides.map((r) => vehicle(tt!, r)) : [];
  if (!why && veh.some((x) => !x)) {
    const r = v!.rides[veh.findIndex((x) => !x)];
    why = `ride not in the app's file: ${r.line} ${norm(r.from)} ${hm(r.dep)}${r.dep >= tt!.windowEnd ? ' (after the file)' : ''}`;
  }
  if (!why && tt) {
    const start = mode === 'arrive' ? v!.depart : c.at;
    const acc = walksToStops(tt, c.from, o)[veh[0]!.a];
    if (start + acc > v!.rides[0].dep + 30)
      why = `start walk: app ${(acc / 60).toFixed(1)} min, VBB ${((v!.rides[0].dep - v!.depart) / 60).toFixed(1)} min`;
    for (let i = 0; !why && i + 1 < veh.length; i++) {
      const x = veh[i]!.b;
      const y = veh[i + 1]!.a;
      const gap = v!.rides[i + 1].dep - v!.rides[i].arr;
      let fp = x === y ? 0 : Infinity;
      for (let e = tt.transferOffset[x]; e < tt.transferOffset[x + 1]; e++)
        if (tt.transferTo[e] === y) fp = Math.min(fp, tt.transferSeconds[e]);
      if (fp === Infinity)
        why = `change with no footpath in the app: ${norm(tt.stops[x].name)} → ${norm(tt.stops[y].name)} (VBB ${(gap / 60).toFixed(0)} min)`;
      else if (fp > gap)
        why = `change time: app ${(fp / 60).toFixed(1)} min, VBB ${(gap / 60).toFixed(1)} min at ${norm(tt.stops[x].name)}`;
    }
    if (!why) {
      const eg = walksToStops(tt, cellCentre(c.to), o)[veh.at(-1)!.b];
      const end = mode === 'arrive' ? c.at : v!.arrive;
      if (v!.rides.at(-1)!.arr + eg > end + 60)
        why = `end walk: app ${(eg / 60).toFixed(1)} min, VBB ${((v!.arrive - v!.rides.at(-1)!.arr) / 60).toFixed(1)} min`;
    }
    if (!why) why = 'fits the app model';
  }
  const k = why.replace(/: .*/, '');
  (tally[k] ??= []).push(gain);
  if ((ex[k] ??= []).length < 12)
    ex[k].push(
      `#${c.i} ${c.mode} −${gain} min: ${why} | VBB ${v?.rides.map((r) => r.line).join(',')}`,
    );
}
const total = Object.values(tally).reduce((a, g) => a + g.length, 0);
console.log(`${file}: ${total} trips where VBB is 3+ min better`);
for (const [k, g] of Object.entries(tally).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${k}: ${g.length} (median ${g.sort((a, b) => a - b)[g.length >> 1]} min)`);
for (const [, e] of Object.entries(ex)) for (const x of e) console.log('    ' + x);
