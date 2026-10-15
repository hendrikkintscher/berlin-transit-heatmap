// Anchor/pin swap check (roadmap 0.13.3): for random pairs of places A and B, the trip
// leaving A at T and the trip arriving at B by T + 30 min, each asked for again within its
// own span (as when the map moves to the trip's other end). Prints the pairs whose trips
// differ, and counts those that differ when only the other end's time is given.
// Usage: tsx bench/swap.ts [pairs, default 200] [seed, default 1] [old]
// "old" compares the way trips on tap were found before 0.13.3: each end's own pass and
// grid, the map at B arriving by when the trip from A arrives.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cellAt,
  decodeTimetable,
  heatGrid,
  journeyTo,
  laterStart,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  travelTimes,
  tripBetween,
  type Journey,
  type PreparedTimetable,
  type Timetable,
} from '../src/index';
import { DATA_DIR, TIMETABLE_FILES } from './data';

const N = Number(process.argv[2] ?? 200);
let seed = Number(process.argv[3] ?? 1);
const OLD = process.argv[4] === 'old';
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

const raw = decodeTimetable(readFileSync(join(DATA_DIR, TIMETABLE_FILES.day))) as Timetable;
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
const walk = loadWalkNetwork(readFileSync(join(DATA_DIR, 'walk.bin')));
const opts = { walk };

type P = { lat: number; lon: number };
/** The rides of a journey in travel order (a reversed one turned round). */
export function rides(tt: PreparedTimetable, j: Journey, reversed = false): string {
  const list = j.legs.flatMap((l) => {
    if (l.type !== 'ride') return [];
    const [a, b] = reversed ? [l.to, l.from] : [l.from, l.to];
    return [`${l.name} ${tt.stops[a].name} > ${tt.stops[b].name}`];
  });
  return (reversed ? list.reverse() : list).join(' | ') || 'walk';
}

/** Before 0.13.3: each end's own pass and the 50 m grid at the other end. */
function oldTrip(tt: PreparedTimetable, o: P, at: P, leaveAt: number, reversed: boolean) {
  const r = travelTimes(tt, o, { trackLegs: true, leaveAt, ...opts });
  const g = heatGrid(tt, r, { cellSizeM: 50, trackStops: true, ...opts });
  const j = journeyTo(tt, r, g, at.lat, at.lon);
  if (!j) return null;
  const seconds = g.seconds[cellAt(g, at.lat, at.lon)];
  return {
    rides: rides(tt, reversed ? j : laterStart(tt, j, r.legs!.rounds!.access, leaveAt), reversed),
    end: leaveAt + seconds,
  };
}

const box = [13.2, 52.43, 13.6, 52.6];
const place = (): P => ({
  lon: box[0] + rnd() * (box[2] - box[0]),
  lat: box[1] + rnd() * (box[3] - box[1]),
});
let differ = 0;
let timeOnly = 0;
let tried = 0;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const a = place();
  const b = place();
  const T = raw.windowStart + Math.floor(rnd() * 3600);
  const pair = `${a.lat.toFixed(5)},${a.lon.toFixed(5)} -> ${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
  if (OLD) {
    const x = oldTrip(fwd, a, b, T, false);
    if (!x) continue;
    const y = oldTrip(back, b, a, -Math.round(x.end), true);
    if (!y) continue;
    tried++;
    if (x.rides !== y.rides) {
      differ++;
      console.log(`${pair} leaving ${T}\n  A anchor: ${x.rides}\n  B anchor: ${y.rides}`);
    }
    continue;
  }
  for (const leaving of [true, false]) {
    const x = tripBetween(fwd, back, a, b, leaving ? { leave: T } : { arrive: T + 1800 }, opts);
    if (!x) continue;
    // The map moved to the other end: the trip asked for within its own span.
    const y = tripBetween(fwd, back, a, b, { leave: x.leave, arrive: x.arrive }, opts);
    tried++;
    const [rx, ry] = [rides(fwd, x.journey), y ? rides(fwd, y.journey) : 'none'];
    if (rx !== ry || x.leave !== y?.leave || x.arrive !== y?.arrive) {
      differ++;
      console.log(
        `${pair} ${leaving ? 'leaving' : 'arriving'} ${T}: ${x.leave}-${x.arrive} vs ${y?.leave}-${y?.arrive}\n  ${rx}\n  ${ry}`,
      );
    }
    // Only the other end's time (as after reloading a link): the same unless a trip with
    // more rides leaves later (arrives earlier).
    const z = tripBetween(
      fwd,
      back,
      a,
      b,
      leaving ? { arrive: x.arrive } : { leave: x.leave },
      opts,
    );
    if (!z || rides(fwd, z.journey) !== rx || z.leave !== x.leave || z.arrive !== x.arrive) {
      timeOnly++;
      if (z && z.journey.transfers <= x.journey.transfers)
        console.log(`  time only, not more rides: ${pair}`);
    }
  }
}
if (!OLD) console.log(`${timeOnly} of ${tried} differ given only the other end's time`);
const ms = (performance.now() - t0) / Math.max(1, tried);
console.log(`${differ} of ${tried} trips differ (${ms.toFixed(0)} ms per pair)`);
