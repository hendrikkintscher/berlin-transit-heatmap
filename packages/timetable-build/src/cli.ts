import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildTimetables } from './build.ts';
import { addDays, berlinToday } from './calendar.ts';
import { openGtfs } from './source.ts';
import { writeOutputs } from './output.ts';
import { addTowns, encodeStreets, readStreetsFile, type Street } from './streets.ts';
import { encodeWalkGraph, readOplFile } from './walk.ts';
import { gzipSync } from 'node:zlib';

const USAGE = `Usage: build-timetable --gtfs <feed.zip|dir> --out <dir> [--feed-version <s>] [--date YYYY-MM-DD] [--no-hourly] [--days <n>] [--today YYYY-MM-DD] [--osm <walkways.opl.gz>]`;

const { values } = parseArgs({
  options: {
    gtfs: { type: 'string' },
    out: { type: 'string' },
    'feed-version': { type: 'string' },
    date: { type: 'string' },
    'no-hourly': { type: 'boolean' },
    days: { type: 'string' },
    today: { type: 'string' },
    osm: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.gtfs || !values.out) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
const bin = (info: object) => (info as { walk: { bytes: number; gzipBytes: number } }).walk;
const started = Date.now();
const log = (message: string) =>
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`);

let walk: Awaited<ReturnType<typeof readOplFile>> | undefined;
let streets: Street[] | undefined;
if (values.osm) {
  walk = await readOplFile(resolve(values.osm));
  const st = walk.stats;
  log(
    `walking network: ${st.nodes} nodes, ${st.edges} edges, ${Math.round(st.lengthKm)} km from ${st.keptWays} of ${st.osmWays} OSM ways`,
  );
  streets = await readStreetsFile(resolve(values.osm));
  log(`street list: ${streets.length} streets`);
}

// Real dates: today in Berlin and the days after it, each with its own 24 hourly windows.
const dayCount = Number(values.days ?? 0);
const today = values.today ? values.today.replaceAll('-', '') : berlinToday();
const dates = Array.from({ length: dayCount }, (_, i) => addDays(today, i));

const source = await openGtfs(resolve(values.gtfs));
try {
  const result = await buildTimetables(source, {
    feedVersion: values['feed-version'],
    serviceDate: values.date,
    hourly: !values['no-hourly'],
    dates,
    walk: walk?.graph,
    log,
  });
  const extra: Record<string, unknown> = {};
  if (walk) {
    const bin = encodeWalkGraph(walk.graph);
    mkdirSync(resolve(values.out), { recursive: true });
    writeFileSync(join(resolve(values.out), 'walk.bin'), bin);
    extra.walk = {
      ...walk.stats,
      bytes: bin.length,
      gzipBytes: gzipSync(bin, { level: 9 }).length,
    };
  }
  if (streets) {
    addTowns(streets, result.stopsFile.stops);
    const json = JSON.stringify(encodeStreets(streets));
    mkdirSync(resolve(values.out), { recursive: true });
    writeFileSync(join(resolve(values.out), 'streets.json'), json);
    extra.streets = {
      count: streets.length,
      bytes: json.length,
      gzipBytes: gzipSync(json, { level: 9 }).length,
    };
  }
  const info = writeOutputs(result, resolve(values.out), extra);
  if (walk) log(`walk.bin: ${mb(bin(info).bytes)} (${mb(bin(info).gzipBytes)} gzipped)`);
  if (streets) {
    const st = (info as unknown as { streets: { bytes: number; gzipBytes: number } }).streets;
    log(`streets.json: ${mb(st.bytes)} (${mb(st.gzipBytes)} gzipped)`);
  }
  log(`service date ${info.serviceDate}, feed ${info.feedVersion}`);
  log(`stops ${info.stats.stops} (of which stations ${info.stats.stations})`);
  for (const [name, w] of Object.entries(info.stats.windows))
    log(
      `${name}: routes ${w.routes}, trips ${w.trips}, stop times ${w.stopTimes}, transfers ${w.transfers}`,
    );
  for (const [name, f] of Object.entries(info.files))
    log(`${name}: ${mb(f.bytes)} (${mb(f.gzipBytes)} gzipped)`);
} finally {
  source.close();
}
