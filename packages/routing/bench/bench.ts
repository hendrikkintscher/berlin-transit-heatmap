/**
 * Benchmark: full computation (travelTimes + heatGrid + gridToGeoJSON) for a
 * handful of origins on the real timetable. Downloads the files from the
 * `timetable-latest` release on first run (see bench/data.ts).
 *
 *   pnpm --filter @berlin-transit-heatmap/routing bench [day|night] [maxRounds]
 */
import { gridToGeoJSON, heatGrid, loadTimetable, travelTimes } from '../src';
import { readTimetable } from './data';

const window = (process.argv[2] ?? 'day') as 'day' | 'night';
const maxRounds = process.argv[3] ? Number(process.argv[3]) : undefined;

const ORIGINS = {
  Alexanderplatz: { lat: 52.5219, lon: 13.4132 },
  Hauptbahnhof: { lat: 52.5251, lon: 13.3694 },
  'Spandau Rathaus': { lat: 52.5354, lon: 13.1998 },
  Köpenick: { lat: 52.4583, lon: 13.5815 },
  Kreuzberg: { lat: 52.4988, lon: 13.4185 },
  'Zehlendorf Mexikoplatz': { lat: 52.4363, lon: 13.2331 },
};

const t0 = performance.now();
const raw = await readTimetable(window);
const t1 = performance.now();
const tt = loadTimetable(raw);
const t2 = performance.now();
const trips = raw.routes.reduce((a, r) => a + r.trips.length, 0);
console.log(
  `${window}: ${raw.stops.length} stops, ${raw.routes.length} routes (${tt.routeCount} FIFO), ${trips} trips, ` +
    `${raw.transfers.length} transfers; parse ${(t1 - t0).toFixed(0)} ms, loadTimetable ${(t2 - t1).toFixed(0)} ms`,
);

const pad = (s: string, n: number) => s.padEnd(n);
console.log(
  `${pad('origin', 24)} ${pad('deps', 6)} ${pad('raptor', 10)} ${pad('grid', 8)} ${pad('geojson', 9)} ${pad('total', 9)} reached`,
);
let worst = 0;
for (const [name, origin] of Object.entries(ORIGINS)) {
  const a = performance.now();
  const r = travelTimes(tt, origin, maxRounds === undefined ? {} : { maxRounds });
  const b = performance.now();
  const g = heatGrid(tt, r);
  const c = performance.now();
  const fc = gridToGeoJSON(g);
  const d = performance.now();
  const reached = r.stopSeconds.filter((v) => v < Infinity).length;
  worst = Math.max(worst, d - a);
  console.log(
    `${pad(name, 24)} ${pad(String(r.departures), 6)} ${pad(`${(b - a).toFixed(0)} ms`, 10)} ${pad(`${(c - b).toFixed(0)} ms`, 8)} ` +
      `${pad(`${(d - c).toFixed(0)} ms`, 9)} ${pad(`${(d - a).toFixed(0)} ms`, 9)} ${reached}/${raw.stops.length} stops, ${fc.features.length} cells`,
  );
}
console.log(
  `worst total: ${worst.toFixed(0)} ms (target: under 1000 ms in Node, about 3 s on a phone)`,
);
