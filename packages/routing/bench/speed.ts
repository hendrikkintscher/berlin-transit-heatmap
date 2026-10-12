/**
 * Speed probe for CI (scripts/speed): times what the web worker does for a map, on the
 * real timetable and footpaths, with the routing code from a given source folder, so
 * the same probe can time a pull request and main side by side. Prints one JSON line.
 *
 *   tsx bench/speed.ts <routing src dir> <data dir with timetable-weekday-10.bin and walk.bin>
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

type Routing = typeof import('../src');

const [srcDir = 'src', dataDir = '.data'] = process.argv.slice(2);
const r = (await import(pathToFileURL(resolve(srcDir, 'index.ts')).href)) as Routing;

// As in packages/web/src/worker.ts: 50 m cells, 4 km/h, typical times, lines on.
const CELL_M = 50;
const WALK_MPS = 4 / 3.6;
const ORIGINS = {
  Alexanderplatz: { lat: 52.5219, lon: 13.4132 },
  'Spandau Rathaus': { lat: 52.5354, lon: 13.1998 },
  Köpenick: { lat: 52.4583, lon: 13.5815 },
  'Zehlendorf Mexikoplatz': { lat: 52.4363, lon: 13.2331 },
};

const bin = readFileSync(join(dataDir, 'timetable-weekday-10.bin'));
const walkBin = readFileSync(join(dataDir, 'walk.bin'));

let t = performance.now();
const data = r.decodeTimetable(bin);
const tt = r.loadTimetable(data as Parameters<Routing['loadTimetable']>[0]);
const walk = r.loadWalkNetwork(
  walkBin.buffer.slice(walkBin.byteOffset, walkBin.byteOffset + walkBin.byteLength),
);
const layout = r.gridLayout({ cellSizeM: CELL_M });
r.snapCells(walk, layout.bbox, layout.cols, layout.rows);
const loadMs = performance.now() - t;

const origins: Record<string, number> = {};
for (const [name, origin] of Object.entries(ORIGINS)) {
  let best = Infinity;
  // One warm-up, then the fastest of three: the least disturbed run.
  for (let rep = 0; rep < 4; rep++) {
    t = performance.now();
    const w = { walk, walkSpeedMps: WALK_MPS };
    const result = r.travelTimes(tt, origin, { trackLegs: true, typical: true, ...w });
    const grid = r.heatGrid(tt, result, { cellSizeM: CELL_M, trackStops: true, ...w });
    r.heatGrid(tt, { ...result, stopSeconds: result.typicalSeconds! }, { cellSizeM: CELL_M, ...w });
    r.routeUsage(tt, result, grid, { minShare: 0.01 });
    if (rep > 0) best = Math.min(best, performance.now() - t);
  }
  origins[name] = best;
}

// The timetable file this code would write for the same data.
const binGzip = gzipSync(r.encodeTimetable(data), { level: 9 }).length;
console.log(JSON.stringify({ loadMs, origins, binGzip }));
