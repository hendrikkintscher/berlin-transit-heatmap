// A tap on the map to a Ziel leaving (step S005): the latest leaving, the tap's second
// search, read off the map's profile search instead (tripBetween's toProfile). Times the tap
// as the worker's bothWays makes it (the Ziel's walks kept, the first search bounded by the
// map's minutes), with and without the profile, against the arriving map's tap, and checks
// that the trips come out the same. Nächste's profile and Typisch/Bestfall's (the hour).
// Usage: tsx bench/latest.ts [places per Ziel, default 300] [seed, default 5]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  latestLeaving,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  travelTimes,
  tripBetween,
  walksToStops,
  type FixedTrip,
} from '../src/index';
import { DATA_DIR, readTimetable } from './data';

const N = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 5);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const raw = await readTimetable('day');
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
const ZIELE = [
  { name: 'Alexanderplatz', lat: 52.5219, lon: 13.4132 },
  { name: 'Spandau Rathaus', lat: 52.5354, lon: 13.1998 },
  { name: 'Köpenick', lat: 52.4583, lon: 13.5815 },
];
// Leaving at 10:57 (Nächste), and the hour 10-11 (Typisch, Bestfall: GOAL_HORIZON_S 2700).
const T = raw.windowStart + 3420;
const H = raw.windowStart;
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
const same = (a: FixedTrip | null, b: FixedTrip | null) => JSON.stringify(a) === JSON.stringify(b);

for (const Z of ZIELE) {
  const zielWalks = walksToStops(fwd, Z, w);
  const profiles = {
    Nächste: travelTimes(back, Z, { profile: { from: -(T + 4200), to: -T }, arriveBy: -T, ...w }),
    'Typisch/Bestfall': travelTimes(back, Z, {
      profile: { from: -(H + 6300), to: -H },
      arriveBy: -H,
      ...w,
    }),
  };
  const taps = Array.from({ length: N }, () => ({
    lon: 13.2 + rnd() * 0.4,
    lat: 52.43 + rnd() * 0.17,
  }));
  // The hint as the worker's (the map's minutes + 15): from the arrival the plain tap finds.
  const plain = taps.map((X) =>
    tripBetween(fwd, back, X, Z, { leave: T }, { ...w, toWalks: zielWalks }),
  );
  const reached = taps.filter((_, i) => plain[i] !== null);
  const opts = (i: number) => ({
    ...w,
    toWalks: zielWalks,
    arriveByHint: plain[taps.indexOf(reached[i]!)]!.arrive + 900,
  });
  const arrivePass = travelTimes(back, Z, {
    leaveAt: -(raw.windowEnd + 1800),
    trackLegs: true,
    ...w,
  });
  const perTap = (f: (X: { lat: number; lon: number }, i: number) => void) =>
    timed(() => reached.forEach(f)) / reached.length;
  const today = perTap((X, i) => tripBetween(fwd, back, X, Z, { leave: T }, opts(i)));
  const arriving = perTap((X) =>
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
    `${Z.name}: ${reached.length} of ${N} places reached; tap today ${today.toFixed(2)} ms, arriving map's tap ${arriving.toFixed(2)} ms`,
  );
  for (const [name, r] of Object.entries(profiles)) {
    const p = r.profile!;
    const withP = perTap((X, i) =>
      tripBetween(fwd, back, X, Z, { leave: T }, { ...opts(i), toProfile: p }),
    );
    let equal = 0;
    let read = 0;
    for (const [i, X] of reached.entries()) {
      const a = tripBetween(fwd, back, X, Z, { leave: T }, opts(i));
      const b = tripBetween(fwd, back, X, Z, { leave: T }, { ...opts(i), toProfile: p });
      if (same(a, b)) equal++;
      else console.log('  differs', X, a?.leave, a?.arrive, b?.leave, b?.arrive);
      // Read off: the profile's latest leaving is the trip's (no second search needed).
      const fw = walksToStops(fwd, X, w);
      if (
        a &&
        a.journey.legs.some((l) => l.type === 'ride') &&
        latestLeaving(p, fw, a.arrive) === a.leave
      )
        read++;
    }
    console.log(
      `  ${name} profile: tap ${withP.toFixed(2)} ms (${(((withP - today) / today) * 100).toFixed(0)} %); same trip ${equal} of ${reached.length}; latest leaving read off in ${read}`,
    );
  }
}
