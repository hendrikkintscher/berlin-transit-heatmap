/**
 * Speed probe for CI (scripts/speed): times what the web worker does for a map, on the
 * real timetable and footpaths, with the routing code from a given source folder, so
 * the same probe can time a pull request and main side by side. Prints one JSON line.
 *
 * With the web app's source folder it also times drawing each map: the colours (softened
 * and painted) and the outlines, as the worker draws them.
 *
 *   tsx bench/speed.ts <routing src dir> <data dir with timetable-weekday-10.bin and walk.bin>
 *     [web src dir]
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

type Routing = typeof import('../src');

const [srcDir = 'src', dataDir = '.data', webDir] = process.argv.slice(2);
const r = (await import(pathToFileURL(resolve(srcDir, 'index.ts')).href)) as Routing;
const load = async <T>(file: string) =>
  (await import(pathToFileURL(resolve(webDir!, file)).href)) as T;
// An older web app without these modules is not timed (draw stays empty).
const web = webDir
  ? await Promise.all([
      load<typeof import('../../web/src/paint')>('paint.ts'),
      load<typeof import('../../web/src/contours')>('contours.ts'),
    ]).catch((e: unknown) => {
      // Only a missing module means an older app; any other error is a real failure.
      if ((e as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return null;
      throw e;
    })
  : null;

// As in the app (worker-runs.ts): 50 m cells, typical times, lines on; walking at 4 km/h
// (the app defaults to 5 km/h, which does not matter for comparing timings).
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
const snapAt = performance.now();
r.snapCells(walk, layout.bbox, layout.cols, layout.rows);
const snapMs = performance.now() - snapAt;
const loadMs = performance.now() - t;

const origins: Record<string, number> = {};
const draw = { colours: 0, outlines: 0 };
for (const [name, origin] of Object.entries(ORIGINS)) {
  let best = Infinity;
  let grid: ReturnType<Routing['heatGrid']> | undefined;
  // One warm-up, then the fastest of three: the least disturbed run.
  for (let rep = 0; rep < 4; rep++) {
    t = performance.now();
    const w = { walk, walkSpeedMps: WALK_MPS };
    const result = r.travelTimes(tt, origin, { trackLegs: true, typical: true, ...w });
    grid = r.heatGrid(
      tt,
      { ...result, stopSeconds: result.typicalSeconds! },
      { cellSizeM: CELL_M, trackStops: true, ...w },
    );
    r.routeUsage(tt, result, grid, { minShare: 0.01 });
    if (rep > 0) best = Math.min(best, performance.now() - t);
  }
  origins[name] = best;
  if (!web || !grid) continue;
  const [paint, contours] = web;
  const g = grid;
  draw.colours += fastest(() => paint.paint(g));
  draw.outlines += fastest(() =>
    contours.outlines(g.seconds, g.cols, g.rows, g.bbox, paint.OUTLINE_BLUR_CELLS),
  );
}

/** One warm-up, then the fastest of three. */
function fastest(f: () => unknown): number {
  let best = Infinity;
  for (let rep = 0; rep < 4; rep++) {
    const t0 = performance.now();
    f();
    if (rep > 0) best = Math.min(best, performance.now() - t0);
  }
  return best;
}

// The timetable file this code would write for the same data.
const binGzip = gzipSync(r.encodeTimetable(data), { level: 9 }).length;
console.log(JSON.stringify({ loadMs, snapMs, origins, ...(web ? { draw } : {}), binGzip }));
