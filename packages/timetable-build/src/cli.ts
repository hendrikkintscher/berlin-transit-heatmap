import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildTimetables } from './build.ts';
import { openGtfs } from './source.ts';
import { writeOutputs } from './output.ts';

const USAGE = `Usage: build-timetable --gtfs <feed.zip|dir> --out <dir> [--feed-version <s>] [--date YYYY-MM-DD] [--no-hourly]`;

const { values } = parseArgs({
  options: {
    gtfs: { type: 'string' },
    out: { type: 'string' },
    'feed-version': { type: 'string' },
    date: { type: 'string' },
    'no-hourly': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.gtfs || !values.out) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const started = Date.now();
const log = (message: string) =>
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`);

const source = await openGtfs(resolve(values.gtfs));
try {
  const result = await buildTimetables(source, {
    feedVersion: values['feed-version'],
    serviceDate: values.date,
    hourly: !values['no-hourly'],
    log,
  });
  const info = writeOutputs(result, resolve(values.out));
  const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
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
