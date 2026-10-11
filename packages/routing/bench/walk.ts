/**
 * Benchmark: per-tap cost with and without the footpath network (Contract 3), as the
 * web worker runs it: travelTimes with typical times, then the best and the typical
 * grid at 50 m. Reads walk.bin and timetable-<window>.json from a build output folder.
 *
 *   pnpm --filter @berlin-transit-heatmap/routing exec tsx bench/walk.ts <dir> [window]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  gridLayout,
  heatGrid,
  loadTimetable,
  loadWalkNetwork,
  snapCells,
  travelTimes,
} from '../src';
import type { Timetable } from '../src';

const dir = process.argv[2] ?? '../../work/out';
const window = process.argv[3] ?? 'weekday-10';
const ORIGINS = {
  Alexanderplatz: { lat: 52.5219, lon: 13.4132 },
  'Spandau Rathaus': { lat: 52.5354, lon: 13.1998 },
  Köpenick: { lat: 52.4583, lon: 13.5815 },
  'Kreuzberg (Paul-Lincke-Ufer)': { lat: 52.4945, lon: 13.4262 },
  'Treptower Park (Spree)': { lat: 52.4915, lon: 13.4683 },
};

const tt = loadTimetable(
  JSON.parse(readFileSync(join(dir, `timetable-${window}.json`), 'utf8')) as Timetable,
);
let t = performance.now();
const walk = loadWalkNetwork(readFileSync(join(dir, 'walk.bin')));
const loadMs = performance.now() - t;
t = performance.now();
const layout = gridLayout({ cellSizeM: 50 });
snapCells(walk, layout.bbox, layout.cols, layout.rows);
console.log(
  `walk.bin: ${walk.nodeCount} nodes, ${walk.edgeCount} edges; load ${loadMs.toFixed(0)} ms, snap grid ${(performance.now() - t).toFixed(0)} ms`,
);

for (const [name, origin] of Object.entries(ORIGINS)) {
  const row: string[] = [];
  const grids = [];
  for (const net of [undefined, walk]) {
    // Warm up once, then time.
    for (let rep = 0; rep < 2; rep++) {
      const a = performance.now();
      const r = travelTimes(tt, origin, { typical: true, trackLegs: true, walk: net });
      const b = performance.now();
      const best = heatGrid(tt, r, { cellSizeM: 50, trackStops: true, walk: net });
      heatGrid(tt, { ...r, stopSeconds: r.typicalSeconds! }, { cellSizeM: 50, walk: net });
      const c = performance.now();
      if (rep === 1) {
        row.push(
          `${net ? 'footpaths' : 'straight'}: raptor ${(b - a).toFixed(0)} ms, grids ${(c - b).toFixed(0)} ms`,
        );
        grids.push(best);
      }
    }
  }
  const [s, f] = grids;
  let n = 0;
  let sum = 0;
  let slower5 = 0;
  for (let k = 0; k < s.seconds.length; k++) {
    if (!(s.seconds[k] < 3600 && f.seconds[k] < Infinity)) continue;
    n++;
    sum += f.seconds[k] - s.seconds[k];
    if (f.seconds[k] - s.seconds[k] > 300) slower5++;
  }
  console.log(
    `${name}: ${row.join(' | ')}; footpaths ${(sum / n / 60).toFixed(1)} min slower on average, ${((100 * slower5) / n).toFixed(1)} % of cells over 5 min slower`,
  );
}
