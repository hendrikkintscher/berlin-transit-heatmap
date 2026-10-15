// A trip kept before the footpaths (roadmap 0.13.8d): moving the map to the other end of a
// trip found with straight-line walks keeps that trip's span; asked for again with the
// footpaths, how often does the same trip still come out, for each widening of the span?
// Usage: tsx bench/kept.ts [pairs, default 300] [seed, default 3]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeTimetable,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  tripBetween,
  walksToStops,
  type Journey,
  type PreparedTimetable,
  type Timetable,
} from '../src/index';
import { DATA_DIR, TIMETABLE_FILES } from './data';

const N = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 3);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const raw = decodeTimetable(readFileSync(join(DATA_DIR, TIMETABLE_FILES.day))) as Timetable;
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
const walk = loadWalkNetwork(readFileSync(join(DATA_DIR, 'walk.bin')));
/** The rides of a journey (as bench/swap.ts). */
const rides = (tt: PreparedTimetable, j: Journey) =>
  j.legs
    .flatMap((l) =>
      l.type === 'ride' ? [`${l.name} ${tt.stops[l.from].name} > ${tt.stops[l.to].name}`] : [],
    )
    .join(' | ');
const SPEED = 5 / 3.6;
const SLACKS = [0, 30, 60, 90, 120, 180, 300];
const box = [13.2, 52.43, 13.6, 52.6];
const place = () => ({
  lon: box[0] + rnd() * (box[2] - box[0]),
  lat: box[1] + rnd() * (box[3] - box[1]),
});
const same = SLACKS.map(() => 0);
const none = SLACKS.map(() => 0);
const withFallback = SLACKS.map(() => 0);
let tried = 0;
let anchoredSame = 0;
let anchoredNone = 0;
let unwalkable = 0;
let fallbackSame = 0;
let anchoredFallback = 0;
/** The first ride's departure and the last ride's arrival of a journey leaving at `t`. */
function rideTimes(j: Journey, t: number) {
  let dep = NaN;
  for (const l of j.legs) {
    if (l.type === 'walk') {
      t += l.seconds;
      continue;
    }
    const n = fwd.routeStopOffset[l.route + 1]! - fwd.routeStopOffset[l.route]!;
    const base = fwd.routeTimeOffset[l.route]!;
    let o = -1;
    for (let trip = 0; trip < fwd.routeTripCount[l.route]!; trip++) {
      const at = base + trip * n + l.fromPos;
      if (fwd.times[at]! >= t && (o < 0 || fwd.times[at]! < fwd.times[o]!)) o = at;
    }
    if (Number.isNaN(dep)) dep = fwd.times[o]!;
    t = fwd.arrivals[o + l.stops.length - 1]!;
  }
  return { dep, arr: t };
}
for (let i = 0; i < N; i++) {
  const a = place();
  const b = place();
  const T = raw.windowStart + Math.floor(rnd() * 3600);
  // Straight-line walks, as before the footpaths: the trip the card showed.
  const x = tripBetween(fwd, back, a, b, { leave: T }, { walkSpeedMps: SPEED });
  if (!x || !x.journey.legs.some((l) => l.type === 'ride')) continue;
  tried++;
  // Anchored on the rides: the first vehicle's departure less the new walk to its stop, the
  // last one's arrival plus the new walk from its stop.
  const ride = x.journey.legs.filter((l) => l.type === 'ride');
  const [r0, r1] = [ride[0]!, ride[ride.length - 1]!];
  const clocks = rideTimes(x.journey, x.leave);
  const o = { walk, walkSpeedMps: SPEED };
  const lo = clocks.dep - walksToStops(fwd, a, o)[r0.from]!;
  const hi = clocks.arr + walksToStops(fwd, b, o)[r1.to]!;
  const y =
    lo > -Infinity && hi < Infinity
      ? tripBetween(fwd, back, a, b, { leave: lo, arrive: hi }, o)
      : null;
  // Today: the kept span does not fit, and the card falls back to the trip leaving at the
  // map's time (the kept trip's departure).
  const f = tripBetween(fwd, back, a, b, { leave: x.leave }, o);
  const fSame = !!f && rides(fwd, f.journey) === rides(fwd, x.journey);
  if (fSame) fallbackSame++;
  if (!(lo > -Infinity && hi < Infinity)) unwalkable++;
  if (!y) {
    anchoredNone++;
    if (fSame) anchoredFallback++;
  } else if (rides(fwd, y.journey) === rides(fwd, x.journey)) {
    anchoredSame++;
    anchoredFallback++;
  }
  const rx = rides(fwd, x.journey);
  SLACKS.forEach((s, k) => {
    const y = tripBetween(
      fwd,
      back,
      a,
      b,
      { leave: x.leave - s, arrive: x.arrive + s },
      { walk, walkSpeedMps: SPEED },
    );
    if (!y) {
      none[k]++;
      if (fSame) withFallback[k]++;
    } else if (rides(fwd, y.journey) === rx) {
      same[k]++;
      withFallback[k]++;
    }
  });
}
console.log(
  `${tried} trips with a ride, kept from straight-line walks, asked again with the footpaths:`,
);
console.log(
  `  the usual trip at the map's time (today's fallback): same rides ${fallbackSame} (${((100 * fallbackSame) / tried).toFixed(1)} %)`,
);
console.log(
  `  anchored on the rides: same rides ${anchoredSame} (${((100 * anchoredSame) / tried).toFixed(1)} %), none ${anchoredNone} (an end stop out of walking reach: ${unwalkable}); with the fallback ${anchoredFallback}`,
);
SLACKS.forEach((s, k) =>
  console.log(
    `  span +${s} s each side: same rides ${same[k]} (${((100 * same[k]) / tried).toFixed(1)} %), none ${none[k]}, other ${tried - same[k] - none[k]}; with the fallback ${withFallback[k]} (${((100 * withFallback[k]) / tried).toFixed(1)} %)`,
  ),
);
