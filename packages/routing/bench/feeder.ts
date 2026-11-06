// S039 measurement: a feeder ride instead of a long walk at the ends, when both arrive as early.
// The app's trip on tap (appJourney) against the same trip with the walks at the start and end
// capped at N minutes, taken when it still arrives within M of the best ("rule N/M"); each rule
// against VBB's planner: how often VBB arrives 3+ min earlier, and how often the app walks 3+ min
// more at the ends with the same arrival (the suite's two VBB targets). Random trips on foot,
// 2–25 km, the coming days, as bench/suite.ts draws them.
// Usage (in packages/routing): tsx bench/feeder.ts [--n 300] [--seed 36] [--start YYYYMMDD] [--days 1-6]
import { parseArgs } from 'node:util';
import { ALT_MIN_SAVING_S, ALT_WALK_CAP_S, distanceM, type Journey, type Origin } from '../src';
import { REGION } from '../src/regions';
import { appJourney, dateOf, dayStartMs, liveData, modeOptions } from './live';
import { vbb } from './planners';

const { values: opt } = parseArgs({
  options: {
    n: { type: 'string', default: '300' },
    seed: { type: 'string', default: '36' },
    start: {
      type: 'string',
      default: dateOf(new Date().toISOString().slice(0, 10).replace(/-/g, ''), 1),
    },
    days: { type: 'string', default: '1-6' },
  },
});
const N = Number(opt.n);
let seed = Number(opt.seed);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const [d0, d1] = opt.days.split('-').map(Number);
const { walk, timetable } = await liveData();
const o = modeOptions('depart', walk);
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
/** Walk caps at the ends (minutes) and how much later than the best a trip may arrive (s). */
const CAPS = [5, 8, 10, 15];
const LATER = [0, 60];

const endWalks = (j: Journey): [number, number] => {
  const first = j.legs[0];
  const last = j.legs[j.legs.length - 1];
  return [
    first?.type === 'walk' ? first.seconds : 0,
    last?.type === 'walk' && j.legs.length > 1 ? last.seconds : 0,
  ];
};
const rides = (j: Journey) => j.legs.filter((l) => l.type === 'ride').length;

interface Trip {
  arrive: number;
  /** Walking before the first ride plus after the last, and the longer of the two. */
  walkEnds: number;
  longEnd: number;
  rides: number;
}
interface Case {
  best: Trip;
  /** Per cap: the capped trip, or null when nothing is within the cap. */
  capped: (Trip | null)[];
  vbb: { arrive: number; walk: number } | null;
}
const cases: Case[] = [];
const passMs: number[] = [];
let drawn = 0;
while (cases.length < N && drawn < 4 * N) {
  drawn++;
  const date = dateOf(opt.start, d0 + Math.floor(rnd() * (d1 - d0 + 1)));
  const hour = Math.floor(rnd() * 24);
  const at = hour * 3600 + Math.floor(rnd() * 60) * 60;
  const tt = await timetable(date, hour, 'depart');
  if (!tt) continue;
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
  let from = near();
  let to = near();
  while (
    distanceM(from.lat, from.lon, to.lat, to.lon) / 1000 < 2 ||
    distanceM(from.lat, from.lon, to.lat, to.lon) / 1000 > 25
  ) {
    from = near();
    to = near();
  }
  const a = appJourney(tt, from, to, at, o, true);
  if (!a || !(a.seconds < Infinity) || rides(a.j) === 0) continue;
  const trip = (x: { j: Journey; seconds: number }): Trip => ({
    arrive: at + x.seconds,
    walkEnds: endWalks(x.j)[0] + endWalks(x.j)[1],
    longEnd: Math.max(...endWalks(x.j)),
    rides: rides(x.j),
  });
  const capped = CAPS.map((cap) => {
    const t0 = performance.now();
    const alt = appJourney(
      tt,
      from,
      to,
      at,
      {
        ...o,
        maxInitialWalkSeconds: cap * 60,
        maxFallbackWalkSeconds: cap * 60,
        maxFinalWalkSeconds: cap * 60,
      },
      true,
    );
    passMs.push(performance.now() - t0);
    return alt && alt.seconds < Infinity && rides(alt.j) > 0 ? trip(alt) : null;
  });
  const day0 = dayStartMs(date);
  const trips = await vbb(from, to, day0 + at * 1000, day0);
  let best = null as (typeof trips)[number] | null;
  for (const t of trips) if (!best || t.arrive < best.arrive) best = t;
  cases.push({
    best: trip(a),
    capped,
    vbb: best ? { arrive: best.arrive, walk: best.walkStart + best.walkEnd } : null,
  });
  if (cases.length % 50 === 0) console.error(`${cases.length} trips …`);
}

const med = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : 0);
const pct = (n: number, of: number) => (of ? `${((100 * n) / of).toFixed(1)} %` : '–');
/** The rule's trip: the capped one when it arrives in time and is another trip. */
const chosen = (c: Case, cap: number, later: number, minSaved = 0): Trip => {
  const alt = c.capped[CAPS.indexOf(cap)];
  const same =
    !alt ||
    (alt.arrive === c.best.arrive &&
      alt.walkEnds === c.best.walkEnds &&
      alt.rides === c.best.rides);
  return !same && alt.arrive <= c.best.arrive + later && c.best.walkEnds - alt.walkEnds >= minSaved
    ? alt
    : c.best;
};
const row = (name: string, pick: (c: Case) => Trip) => {
  const asked = cases.filter((c) => c.vbb);
  const changed = cases.filter((c) => pick(c) !== c.best);
  const saved = changed.map((c) => (c.best.walkEnds - pick(c).walkEnds) / 60);
  const moreRides = changed.filter((c) => pick(c).rides > c.best.rides).length;
  const fewerRides = changed.filter((c) => pick(c).rides < c.best.rides).length;
  const later = changed.map((c) => pick(c).arrive - c.best.arrive);
  const vbbBetter = asked.filter((c) => pick(c).arrive - c.vbb!.arrive >= 180).length;
  const sameMore = asked.filter(
    (c) => Math.abs(pick(c).arrive - c.vbb!.arrive) <= 60 && pick(c).walkEnds >= c.vbb!.walk + 180,
  ).length;
  const walk15 = cases.filter((c) => pick(c).longEnd >= 900).length;
  return `| ${name} | ${pct(changed.length, cases.length)} | ${med(saved).toFixed(1)} min | ${pct(moreRides, changed.length)} / ${pct(fewerRides, changed.length)} | ${later.length ? Math.round(Math.max(...later)) : 0} s | ${pct(walk15, cases.length)} | ${pct(vbbBetter, asked.length)} | ${pct(sameMore, asked.length)} |`;
};
console.log(
  `# S039: feeder ride instead of a long walk — ${cases.length} trips on foot, seed ${opt.seed}, from ${opt.start}, days ${opt.days}; VBB asked for ${cases.filter((c) => c.vbb).length}\n`,
);
console.log(
  '| Rule (end walks capped / may arrive later) | Trips changed | Walk saved (median) | of which more / fewer rides | Latest arrival vs best | Trips with a 15+ min walk at an end | VBB 3+ min better | Same arrival as VBB, 3+ min more walking |',
);
console.log('| --- | --: | --: | --: | --: | --: | --: | --: |');
console.log(row('as today (30 min walks, fewest rides)', (c) => c.best));
for (const later of LATER)
  for (const cap of CAPS)
    console.log(row(`${cap} min / +${later} s`, (c) => chosen(c, cap, later)));
for (const minSaved of [ALT_MIN_SAVING_S, 300])
  console.log(
    row(
      `${ALT_WALK_CAP_S / 60} min / +0 s, only when it saves ${minSaved / 60}+ min${minSaved === ALT_MIN_SAVING_S ? ' = shown on the card (S045)' : ''}`,
      (c) => chosen(c, ALT_WALK_CAP_S / 60, 0, minSaved),
    ),
  );
console.log(
  `\nSecond pass per tap (appJourney with the caps): median ${med(passMs).toFixed(0)} ms in Node.`,
);
