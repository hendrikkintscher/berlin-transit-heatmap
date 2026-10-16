// Map walk rule (roadmap 0.13.9): today the map's last walk takes the fastest stop within
// 15 minutes and goes up to 30 only where nothing is that near. Compares that with
// "fastest, even with a longer walk" (every walk up to 30 minutes counts): how often the
// map's minutes agree with the trip on tap at random places, which cells change, and how
// long a map takes. Leaving at 10:00 (Nächste), 50 m cells as in the app.
// Usage: tsx bench/walkrule.ts [places per start, default 130] [seed, default 7]
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
  type HeatGrid,
  type Timetable,
} from '../src/index';
import { REGION } from '../src/regions';
import { DATA_DIR, TIMETABLE_FILES } from './data';

const N = Number(process.argv[2] ?? 130);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const raw = decodeTimetable(readFileSync(join(DATA_DIR, TIMETABLE_FILES.day))) as Timetable;
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
const wb = readFileSync(join(DATA_DIR, 'walk.bin'));
const walk = loadWalkNetwork(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
const w = { walk, walkSpeedMps: 5 / 3.6 };
const T = raw.windowStart;
const STARTS = [
  { name: 'Alexanderplatz', lat: 52.5219, lon: 13.4132 },
  { name: 'Spandau Rathaus', lat: 52.5354, lon: 13.1998 },
  { name: 'Köpenick', lat: 52.4583, lon: 13.5815 },
];
const LONG = { maxFinalWalkSeconds: 1800, maxFallbackWalkSeconds: 1800 };
const LONG_TRIP = { maxInitialWalkSeconds: 1800, maxFallbackWalkSeconds: 1800 };
/** Map rules: the start's pass options and the grid's; trip options to compare against. */
const RULES = {
  today: { pass: {}, grid: {}, trip: {} },
  // Only the map's last walk changes; the trip stays as today.
  mapFastest: { pass: {}, grid: LONG, trip: {} },
  // The map's last walk and the trip's walks at both ends (and the map's first walk).
  bothFastest: { pass: LONG_TRIP, grid: LONG, trip: LONG_TRIP },
} as const;
type Rule = keyof typeof RULES;

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1]!;
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
const agree: Record<Rule, number[]> = { today: [], mapFastest: [], bothFastest: [] };
const signed: Record<Rule, number[]> = { today: [], mapFastest: [], bothFastest: [] };
const tripMs: Record<Rule, number[]> = { today: [], mapFastest: [], bothFastest: [] };
const longest: Record<Rule, number[]> = { today: [], mapFastest: [], bothFastest: [] };
const tripMin: Record<Rule, number[]> = { today: [], mapFastest: [], bothFastest: [] };

for (const S of STARTS) {
  const grids = {} as Record<Rule, HeatGrid>;
  const ms = {} as Record<Rule, number>;
  for (const rule of Object.keys(RULES) as Rule[]) {
    const R = RULES[rule];
    const make = () => {
      const r = travelTimes(fwd, S, { trackLegs: true, leaveAt: T, ...w, ...R.pass });
      return heatGrid(fwd, r, { cellSizeM: 50, trackStops: true, ...w, ...R.grid });
    };
    grids[rule] = make();
    const t: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      make();
      t.push(performance.now() - t0);
    }
    ms[rule] = median(t);
  }
  // Cells that change against today.
  for (const rule of ['mapFastest', 'bothFastest'] as Rule[]) {
    const a = grids.today.seconds;
    const b = grids[rule].seconds;
    let reach = 0;
    let changed = 0;
    let by3 = 0;
    let newly = 0;
    const gain: number[] = [];
    for (let k = 0; k < a.length; k++) {
      if (a[k] < Infinity) reach++;
      if (a[k] === b[k]) continue;
      if (!(a[k] < Infinity)) {
        if (b[k] < Infinity) newly++;
        continue;
      }
      const d = (a[k] - b[k]) / 60;
      if (Math.abs(d) >= 0.5) changed++;
      if (Math.abs(d) >= 3) by3++;
      if (d > 0) gain.push(d);
    }
    console.log(
      `${S.name} ${rule}: map ${ms[rule].toFixed(0)} ms (today ${ms.today.toFixed(0)}); ` +
        `cells reached ${reach}, ${((100 * changed) / reach).toFixed(1)} % change by ½ min+, ` +
        `${((100 * by3) / reach).toFixed(1)} % by 3 min+ (median gain ${gain.length ? median(gain).toFixed(1) : '-'} min), ${newly} newly reached`,
    );
  }
  // Random places: map minutes against the trip's.
  let n = 0;
  while (n < N) {
    const P = { lat: minLat + rnd() * (maxLat - minLat), lon: minLon + rnd() * (maxLon - minLon) };
    if (!(gridValueAt(grids.today, P.lat, P.lon) < Infinity)) continue;
    const trips = {} as Record<Rule, number>;
    for (const rule of Object.keys(RULES) as Rule[]) {
      const t0 = performance.now();
      const f = tripBetween(fwd, back, S, P, { leave: T }, { ...w, ...RULES[rule].trip });
      tripMs[rule].push(performance.now() - t0);
      trips[rule] = f ? Math.ceil((f.arrive - T) / 60) : Infinity;
      const walks = f ? f.journey.legs.filter((l) => l.type === 'walk').map((l) => l.seconds) : [];
      longest[rule].push(walks.length ? Math.max(...walks) / 60 : 0);
    }
    if (!(trips.today < Infinity)) continue;
    n++;
    for (const rule of Object.keys(RULES) as Rule[]) {
      const map = Math.ceil(gridValueAt(grids[rule], P.lat, P.lon) / 60);
      agree[rule].push(Math.abs(map - trips[rule]));
      signed[rule].push(map - trips[rule]);
      tripMin[rule].push(trips[rule]);
    }
  }
}

for (const rule of Object.keys(RULES) as Rule[]) {
  const d = agree[rule];
  const pct = (f: (x: number) => boolean) => ((100 * d.filter(f).length) / d.length).toFixed(0);
  const p90 = tripMs[rule].slice().sort((a, b) => a - b)[Math.floor(tripMs[rule].length * 0.9)]!;
  const earlier = tripMin[rule].map((m, i) => tripMin.today[i] - m).filter((x) => x > 0);
  const tripsChanged = tripMin[rule].filter((m, i) => m !== tripMin.today[i]).length;
  console.log(
    `${rule}: ${d.length} places; same minute ${pct((x) => x === 0)} %, within 1 ${pct((x) => x <= 1)} %, ` +
      `3+ apart ${pct((x) => x >= 3)} % (map lower ${signed[rule].filter((x) => x <= -3).length}, ` +
      `higher ${signed[rule].filter((x) => x >= 3).length}); trips changed against today ${tripsChanged} ` +
      `; tap trip ${median(tripMs[rule]).toFixed(1)} ms median, ${p90.toFixed(1)} p90; ` +
      `longest walk over 15 min in ${longest[rule].filter((x) => x > 15).length} trips ` +
      (earlier.length ? `(earlier by ${median(earlier)} min median)` : ''),
  );
}
