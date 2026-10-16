// Ankommen under Typisch and Bestfall (roadmap 0.13.11): the map counts arrivals within the
// hour ("Ankunft 11 bis 12 Uhr"); the trip on tap arrived by the hour's start, since 0.13.11
// by its end ("end" below). For random places, the map's minutes against the card's
// (arrive - leave) and whether the card's arrival falls in the map's hour, for the trip
// asked to arrive by different moments.
// Usage: tsx bench/arrivehour.ts [places per Ziel, default 130] [seed, default 7]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeTimetable,
  gridValueAt,
  heatGrid,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  travelTimes,
  tripBetween,
  type FixedTrip,
  type Timetable,
} from '../src/index';
import { REGION } from '../src/regions';
import { DATA_DIR, TIMETABLE_FILES } from './data';

const N = Number(process.argv[2] ?? 130);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const raw = decodeTimetable(readFileSync(join(DATA_DIR, TIMETABLE_FILES.day))) as Timetable;
const fwd = loadTimetable(raw);
// As the app: the file of the hour before, arrivals in the hour after its window.
const H = raw.windowEnd;
const back = loadTimetable(reverseTimetable(raw, H, H + 3600));
const wb = readFileSync(join(DATA_DIR, 'walk.bin'));
const walk = loadWalkNetwork(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
// On foot as in the app (FASTEST_WALK in packages/web/src/worker-runs.ts).
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

/** Ways to ask for the trip on tap; each gives one trip (or null). */
const WAYS = {
  // Before 0.13.11: arriving by the hour's start.
  start: (Z: P, X: P) => tripBetween(fwd, back, X, Z, { arrive: H }, w),
  mid: (Z: P, X: P) => tripBetween(fwd, back, X, Z, { arrive: H + 1800 }, w),
  // Since 0.13.11.
  end: (Z: P, X: P) => tripBetween(fwd, back, X, Z, { arrive: H + 3600 }, w),
  // Of the trips arriving by each 10 minutes of the hour, the quickest (six searches).
  quickest: (Z: P, X: P) => {
    let best: FixedTrip | null = null;
    for (let k = 1; k <= 6; k++) {
      const f = tripBetween(fwd, back, X, Z, { arrive: H + 600 * k }, w);
      if (f && f.arrive > H && (!best || f.arrive - f.leave < best.arrive - best.leave)) best = f;
    }
    return best;
  },
} as const;
type Way = keyof typeof WAYS;
type P = { lat: number; lon: number };

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1] ?? NaN;
const pct = (a: number[], f: (x: number) => boolean) =>
  `${((100 * a.filter(f).length) / a.length).toFixed(0)} %`;
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
const ways = Object.keys(WAYS) as Way[];
const measures = ['typical', 'best'] as const;
const diff = Object.fromEntries(
  measures.flatMap((m) => ways.map((k) => [`${m}.${k}`, [] as number[]])),
);
const inHour = Object.fromEntries(ways.map((k) => [k, [] as number[]]));
const before = Object.fromEntries(ways.map((k) => [k, [] as number[]]));
const ms = Object.fromEntries(ways.map((k) => [k, [] as number[]]));

for (const Z of ZIELE) {
  const grid = (typical: boolean) => {
    const r = travelTimes(back, Z, { typical, ...w });
    const s = typical && r.typicalSeconds ? { ...r, stopSeconds: r.typicalSeconds } : r;
    return heatGrid(back, s, { cellSizeM: 50, ...w });
  };
  const maps = { typical: grid(true), best: grid(false) };
  let n = 0;
  while (n < N) {
    const X = { lat: minLat + rnd() * (maxLat - minLat), lon: minLon + rnd() * (maxLon - minLon) };
    if (!(gridValueAt(maps.best, X.lat, X.lon) < Infinity)) continue;
    const trips = {} as Record<Way, FixedTrip | null>;
    for (const k of ways) {
      const t0 = performance.now();
      trips[k] = WAYS[k](Z, X);
      ms[k].push(performance.now() - t0);
    }
    if (ways.some((k) => !trips[k])) continue;
    n++;
    for (const k of ways) {
      const f = trips[k]!;
      const card = Math.max(1, Math.round((f.arrive - f.leave) / 60));
      for (const m of measures)
        diff[`${m}.${k}`].push(card - Math.ceil(gridValueAt(maps[m], X.lat, X.lon) / 60));
      inHour[k].push(f.arrive > H && f.arrive <= H + 3600 ? 1 : 0);
      before[k].push((H - f.arrive) / 60);
    }
  }
}

console.log(`${N * ZIELE.length} places, arriving ${H / 3600}–${H / 3600 + 1} Uhr`);
for (const k of ways) {
  const late = before[k].filter((x) => x > 0);
  console.log(
    `${k}: arrival in the map's hour ${pct(inHour[k], (x) => x === 1)}` +
      (late.length ? ` (before it: ${late.length}, median ${median(late).toFixed(0)} min)` : '') +
      `; tap ${median(ms[k]).toFixed(1)} ms median`,
  );
  for (const m of measures) {
    const d = diff[`${m}.${k}`];
    console.log(
      `  ${m}: same minute ${pct(d, (x) => x === 0)}, within 1 ${pct(d, (x) => Math.abs(x) <= 1)}, ` +
        `3+ apart ${pct(d, (x) => Math.abs(x) >= 3)} (card longer ${d.filter((x) => x >= 3).length}, ` +
        `shorter ${d.filter((x) => x <= -3).length}), median card − map ${median(d)} min`,
    );
  }
}
