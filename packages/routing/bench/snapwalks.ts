// S054 measurement: start and end walks against the straight line, for random trips as
// bench/suite.ts --ci draws them (places within 400 m of a stop, 2–25 km apart) but on one
// file and many more trips. A walk far longer than the straight line means the place was
// snapped to a cut-off path (S042: 36 of 773 start walks over 2.5×).
//
// Usage: tsx bench/snapwalks.ts [--n 1000] [--seed 40] [--data packages/routing/.data]
import { parseArgs } from 'node:util';
import { distanceM, snapOrigin, snapStops, walksToStops, type Origin } from '../src';
import { REGION } from '../src/regions';
import { appJourney, liveData, modeOptions, WALK_MPS } from './live';

const { values: opt } = parseArgs({
  options: {
    n: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '40' },
    data: { type: 'string', default: '.data' },
    list: { type: 'boolean', default: false },
  },
});
let seed = Number(opt.seed);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const { walk, timetable } = await liveData(opt.data, true);
const tt = (await timetable('weekday', 10, 'depart', 'weekday-10'))!;
const o = modeOptions('depart', walk);
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
const near = (): Origin => {
  for (;;) {
    const s = tt.stops[Math.floor(rnd() * tt.stopCount)];
    if (s.lon < minLon || s.lon > maxLon || s.lat < minLat || s.lat > maxLat) continue;
    const a = rnd() * 2 * Math.PI;
    const m = rnd() * 400;
    return {
      lat: s.lat + (m * Math.cos(a)) / 111320,
      lon: s.lon + (m * Math.sin(a)) / (111320 * Math.cos((s.lat * Math.PI) / 180)),
    };
  }
};

interface W {
  ratio: number;
  straight: number;
  walked: number;
  at: Origin;
  stop: number;
}
const ends: Record<'start' | 'end', W[]> = { start: [], end: [] };
const measure = (p: Origin, stop: number, list: W[]) => {
  const s = walksToStops(tt, p, o)[stop];
  const straight = distanceM(p.lat, p.lon, tt.stops[stop].lat, tt.stops[stop].lon);
  if (!(s < Infinity) || straight < 1) return;
  const walked = s * WALK_MPS;
  list.push({ ratio: walked / straight, straight, walked, at: p, stop });
};
let trips = 0;
for (let n = 0; n < Number(opt.n); n++) {
  let from = near();
  let to = near();
  let km = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
  while (km < 2 || km > 25) {
    from = near();
    to = near();
    km = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
  }
  const at = 10 * 3600 + Math.floor(rnd() * 60) * 60;
  const a = appJourney(tt, from, to, at, o, true);
  if (!a || !(a.seconds < Infinity)) continue;
  const rides = a.j.legs.filter((l) => l.type === 'ride');
  if (!rides.length) continue;
  trips++;
  measure(from, rides[0].from, ends.start);
  measure(to, rides.at(-1)!.to, ends.end);
}
/** S-, U-Bahn and regional stations: their stop sits on the platform, reached by its entrances. */
const station = (name: string) => /^(S|U|S\+U) |Bhf|Bahnhof/.test(name);
const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
console.log(`${trips} trips with a ride (n ${opt.n}, seed ${opt.seed})`);
console.log(
  '| walk | count | median | p90 | over 2.5× | over 2.5× and 100+ m extra | of those, not at a rail station | worst |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [k, list] of Object.entries(ends)) {
  const r = list.map((w) => w.ratio).sort((x, y) => x - y);
  const over = list.filter((w) => w.ratio > 2.5);
  const worst = over.sort((x, y) => y.ratio - x.ratio)[0];
  console.log(
    `| ${k} | ${list.length} | ${q(r, 0.5).toFixed(2)}× | ${q(r, 0.9).toFixed(2)}× | ${over.length} | ` +
      `${over.filter((w) => w.walked - w.straight >= 100).length} | ` +
      `${over.filter((w) => w.walked - w.straight >= 100 && !station(tt.stops[w.stop].name)).length} | ` +
      (worst
        ? `${worst.ratio.toFixed(1)}× (${worst.straight.toFixed(0)} m → ${worst.walked.toFixed(0)} m) |`
        : '– |'),
  );
}
if (opt.list)
  for (const [k, list] of Object.entries(ends))
    for (const w of list.filter((w) => w.ratio > 2.5 && w.walked - w.straight >= 100))
      console.log(
        k,
        `${w.at.lat.toFixed(6)},${w.at.lon.toFixed(6)}`,
        tt.stops[w.stop].name,
        `straight ${w.straight.toFixed(0)} m, walked ${w.walked.toFixed(0)} m,`,
        `place ${snapOrigin(walk, w.at).metres[0].toFixed(0)} m off the network,`,
        `stop ${snapStops(walk, tt).metres[w.stop].toFixed(0)} m off`,
      );
