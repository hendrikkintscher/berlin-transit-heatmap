// Ankommen under Bestfall (step S001): the trip on tap against the map's minutes, for
// cheaper ways than six arrival slots. As the app, the tap reuses the pass arriving by the
// hour's end (warmed ahead of the tap) and the Ziel's walks to the stops (kept per map).
// "picked": the map pass also keeps, per stop, the arrival moment of its quickest trip; the
// tap takes the stop the place's quickest way runs through and asks for the trip arriving
// by that moment (one search pair, not warmed).
// Usage: tsx bench/arriveslots.ts [places per Ziel, default 130] [seed, default 7]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeStopList,
  decodeTimetable,
  gridValueAt,
  heatGrid,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  travelTimes,
  tripBetween,
  walksToStops,
  cellAt,
  type FixedTrip,
  type HeatGrid,
  type Timetable,
  type TravelTimeResult,
} from '../src/index';
import { REGION } from '../src/regions';
import { DATA_DIR, TIMETABLE_FILES } from './data';

const N = Number(process.argv[2] ?? 130);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const list = decodeStopList(readFileSync(join(DATA_DIR, 'stoplist.bin')));
const raw = decodeTimetable(readFileSync(join(DATA_DIR, TIMETABLE_FILES.day)), list) as Timetable;
const fwd = loadTimetable(raw);
const H = raw.windowEnd;
const back = loadTimetable(reverseTimetable(raw, H, H + 3600));
const wb = readFileSync(join(DATA_DIR, 'walk.bin'));
const walk = loadWalkNetwork(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
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
type P = { lat: number; lon: number };

/** Per Ziel: what the app keeps for taps. */
interface Kept {
  Z: P;
  toWalks: Float32Array;
  endPass: TravelTimeResult;
  /** Per stop, the arrival at the Ziel of its quickest trip of the hour (NaN: none). */
  bestArrive: Float64Array;
  /** Per stop, how long that quickest trip takes from the stop. */
  bestSeconds: Float32Array;
  grid: HeatGrid;
}

const opts = (k: Kept) => ({ ...w, toWalks: k.toWalks });
const at = (k: Kept, X: P, arrive: number) =>
  tripBetween(fwd, back, X, k.Z, { arrive }, opts(k), arrive === H + 3600 ? k.endPass : undefined);
const quick = (a: FixedTrip | null, b: FixedTrip | null) =>
  b && b.arrive > H && (!a || b.arrive - b.leave < a.arrive - a.leave) ? b : a;
/** The quickest of the trips arriving by each of `n` evenly spaced moments of the hour. */
const slots = (n: number) => (k: Kept, X: P) => {
  let best: FixedTrip | null = null;
  for (let i = n; i >= 1; i--) best = quick(best, at(k, X, H + (3600 * i) / n));
  return best;
};
const WAYS = {
  end: (k: Kept, X: P) => at(k, X, H + 3600),
  slots2: slots(2),
  slots3: slots(3),
  slots6: slots(6),
  picked: (k: Kept, X: P) => {
    const fw = walksToStops(fwd, X, w);
    let s0 = -1;
    let t0 = Infinity;
    for (let s = 0; s < fw.length; s++) {
      if (!(fw[s] < Infinity) || Number.isNaN(k.bestArrive[s])) continue;
      const t = fw[s] + k.bestSeconds[s];
      if (t < t0) [t0, s0] = [t, s];
    }
    const arrive = s0 < 0 ? H + 3600 : k.bestArrive[s0];
    // Keep the end's trip if it is quicker (e.g. walking all the way).
    return quick(at(k, X, H + 3600), at(k, X, arrive));
  },
  pickedOnly: (k: Kept, X: P) => {
    const fw = walksToStops(fwd, X, w);
    let s0 = -1;
    let t0 = Infinity;
    for (let s = 0; s < fw.length; s++) {
      if (!(fw[s] < Infinity) || Number.isNaN(k.bestArrive[s])) continue;
      const t = fw[s] + k.bestSeconds[s];
      if (t < t0) [t0, s0] = [t, s];
    }
    return at(k, X, s0 < 0 ? H + 3600 : k.bestArrive[s0]);
  },
  // The map's own stop for the tapped cell (heatGrid trackStops), no walks searched.
  cell: (k: Kept, X: P) => {
    const c = cellAt(k.grid, X.lat, X.lon);
    const s0 = c < 0 ? -1 : k.grid.stop![c];
    return at(k, X, s0 < 0 || Number.isNaN(k.bestArrive[s0]) ? H + 3600 : k.bestArrive[s0]);
  },
} as const;
type Way = keyof typeof WAYS;

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1] ?? NaN;
const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
const pct = (a: number[], f: (x: number) => boolean) =>
  `${((100 * a.filter(f).length) / a.length).toFixed(0)} %`;
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
const ways = Object.keys(WAYS) as Way[];
const diff = Object.fromEntries(ways.map((k) => [k, [] as number[]]));
const ms = Object.fromEntries(ways.map((k) => [k, [] as number[]]));
const mapMs: number[] = [];

for (const Z of ZIELE) {
  let t = performance.now();
  const map = travelTimes(back, Z, { trackLegs: true, ...w });
  mapMs.push(performance.now() - t);
  const grid = heatGrid(back, map, { cellSizeM: 50, trackStops: true, ...w });
  // The quickest trip's arrival per stop, from a profile over the same window.
  const prof = travelTimes(back, Z, {
    profile: { from: back.windowStart, to: back.windowEnd },
    ...w,
  }).profile!;
  const S = back.stopCount;
  const bestArrive = new Float64Array(S).fill(NaN);
  const bestSeconds = new Float32Array(S).fill(Infinity);
  for (let s = 0; s < S; s++)
    for (let i = prof.offset[s]; i < prof.offset[s + 1]; i++) {
      const d = prof.arrival[i] - prof.departure[i];
      if (d < bestSeconds[s]) [bestSeconds[s], bestArrive[s]] = [d, -prof.departure[i]];
    }
  const toWalks = walksToStops(fwd, Z, w);
  const endPass = travelTimes(back, Z, {
    ...w,
    accessSeconds: toWalks,
    leaveAt: -(H + 3600),
    trackLegs: true,
  });
  const kept: Kept = { Z, toWalks, endPass, bestArrive, bestSeconds, grid };
  let n = 0;
  while (n < N) {
    const X = { lat: minLat + rnd() * (maxLat - minLat), lon: minLon + rnd() * (maxLon - minLon) };
    const mapMin = Math.ceil(gridValueAt(grid, X.lat, X.lon) / 60);
    if (!(mapMin < Infinity)) continue;
    const trips = {} as Record<Way, FixedTrip | null>;
    for (const k of ways) {
      t = performance.now();
      trips[k] = WAYS[k](kept, X);
      ms[k].push(performance.now() - t);
    }
    if (ways.some((k) => !trips[k])) continue;
    n++;
    for (const k of ways) {
      const f = trips[k]!;
      diff[k].push(Math.max(1, Math.round((f.arrive - f.leave) / 60)) - mapMin);
    }
  }
}

console.log(`${N * ZIELE.length} places, Bestfall, arriving ${H / 3600}–${H / 3600 + 1} Uhr`);
console.log(`map pass median ${median(mapMs).toFixed(0)} ms`);
console.log('way | within 1 min | 3+ apart | median card−map | tap median / p90 ms');
for (const k of ways) {
  const d = diff[k];
  console.log(
    `${k} | ${pct(d, (x) => Math.abs(x) <= 1)} | ${pct(d, (x) => Math.abs(x) >= 3)} | ${median(d)} | ` +
      `${median(ms[k]).toFixed(1)} / ${q(ms[k], 0.9).toFixed(1)}`,
  );
}
