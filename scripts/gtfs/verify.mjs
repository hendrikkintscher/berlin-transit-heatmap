#!/usr/bin/env node
// Sanity-checks an extracted GTFS feed and writes a small manifest.
// Usage: node scripts/gtfs/verify.mjs <extracted-dir> [manifest-out.json]
// Exits non-zero if the feed looks broken, so the refresh workflow never
// publishes a bad dataset.

import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const REQUIRED = {
  'agency.txt': ['agency_id', 'agency_name'],
  'stops.txt': ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
  'routes.txt': ['route_id', 'route_type'],
  'trips.txt': ['route_id', 'service_id', 'trip_id'],
  'stop_times.txt': ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
};
// VBB ships both; at least one is required by the GTFS spec.
const CALENDAR_FILES = ['calendar.txt', 'calendar_dates.txt'];
const OPTIONAL = ['transfers.txt', 'pathways.txt', 'shapes.txt', 'frequencies.txt'];

// Rough floor values well below the real VBB feed, to catch truncated downloads.
const MIN_ROWS = { 'stops.txt': 10_000, 'trips.txt': 50_000, 'stop_times.txt': 1_000_000 };

// Berlin-Brandenburg bounding box with some slack.
const BBOX = { minLat: 51.0, maxLat: 54.0, minLon: 11.0, maxLon: 15.5 };

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function scan(path, onRow) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header = null;
  let rows = 0;
  for await (let line of rl) {
    if (header === null) {
      header = splitCsvLine(line.replace(/^\uFEFF/, '')).map((h) => h.trim());
      continue;
    }
    if (line === '') continue;
    rows++;
    if (onRow) onRow(splitCsvLine(line), header);
  }
  return { header: header ?? [], rows };
}

const toIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

async function main() {
  const [dir, manifestOut] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: verify.mjs <extracted-gtfs-dir> [manifest-out.json]');
    process.exit(2);
  }
  const errors = [];
  const files = {};

  for (const [file, cols] of Object.entries(REQUIRED)) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      errors.push(`missing ${file}`);
      continue;
    }

    let badCoords = 0;
    let onRow;
    if (file === 'stops.txt') {
      onRow = (r, h) => {
        const lat = Number(r[h.indexOf('stop_lat')]);
        const lon = Number(r[h.indexOf('stop_lon')]);
        if (!(lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon))
          badCoords++;
      };
    }
    const { header, rows } = await scan(path, onRow);
    const missingCols = cols.filter((c) => !header.includes(c));
    if (missingCols.length) errors.push(`${file} lacks columns: ${missingCols.join(', ')}`);
    if (MIN_ROWS[file] && rows < MIN_ROWS[file])
      errors.push(`${file} has only ${rows} rows (expected >= ${MIN_ROWS[file]})`);
    if (file === 'stops.txt' && badCoords > rows * 0.01)
      errors.push(`stops.txt: ${badCoords} stops outside Berlin-Brandenburg`);
    files[file] = rows;
  }

  // Service validity window, from calendar.txt and calendar_dates.txt.
  let start = null;
  let end = null;
  const widen = (d) => {
    if (!/^\d{8}$/.test(d)) return;
    if (start === null || d < start) start = d;
    if (end === null || d > end) end = d;
  };
  const calFiles = CALENDAR_FILES.filter((f) => existsSync(join(dir, f)));
  if (calFiles.length === 0) errors.push('missing calendar.txt and calendar_dates.txt');
  for (const file of calFiles) {
    const { rows } = await scan(join(dir, file), (r, h) => {
      if (file === 'calendar.txt') {
        widen(r[h.indexOf('start_date')]);
        widen(r[h.indexOf('end_date')]);
      } else widen(r[h.indexOf('date')]);
    });
    files[file] = rows;
  }
  for (const file of OPTIONAL) {
    if (existsSync(join(dir, file))) files[file] = (await scan(join(dir, file))).rows;
  }

  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  if (end !== null && end < today) errors.push(`feed expired: service ends ${toIso(end)}`);

  const manifest = {
    verifiedAt: new Date().toISOString(),
    serviceStart: start && toIso(start),
    serviceEnd: end && toIso(end),
    rows: files,
  };
  console.log(JSON.stringify(manifest, null, 2));

  if (errors.length) {
    console.error('\nGTFS verification failed:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  if (manifestOut) writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
