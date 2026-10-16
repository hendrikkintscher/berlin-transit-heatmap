// Rolling on (roadmap 0.13.14): a missed connection asks for the next one leaving at the
// clock's time, on the next hour's file (after 23 Uhr the next day's 0 Uhr, its times read
// a day later). For random pairs of places, the trip leaving at a few clock times on that
// file against the file of the clock's own hour (the best there is) and, after midnight,
// against the chosen 23 Uhr file (what the card used before); with the time per trip.
// Needs the hourly files: node packages/timetable-build/bin/build-timetable.js --gtfs
// data/gtfs --out <dir>. Usage: tsx bench/rollon.ts <dir> [pairs, default 150] [seed, default 3]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeStopList,
  decodeTimetable,
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  shiftTimetable,
  tripBetween,
  type PreparedTimetable,
  type Timetable,
} from '../src/index';
import { REGION } from '../src/regions';
import { DATA_DIR } from './data';

const DIR = process.argv[2]!;
const N = Number(process.argv[3] ?? 150);
let seed = Number(process.argv[4] ?? 3);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const list = decodeStopList(readFileSync(join(DIR, 'stoplist.bin')));
const wb = readFileSync(join(DATA_DIR, 'walk.bin'));
const walk = loadWalkNetwork(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wb.byteLength));
const opts = {
  walk,
  walkSpeedMps: 5 / 3.6,
  maxInitialWalkSeconds: 1800,
  maxFallbackWalkSeconds: 1800,
};

function both(window: string, shift = 0): [PreparedTimetable, PreparedTimetable] {
  let raw = decodeTimetable(readFileSync(join(DIR, `timetable-${window}.bin`)), list) as Timetable;
  if (shift) raw = shiftTimetable(raw, shift);
  return [
    loadTimetable(raw),
    loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600)),
  ];
}

const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
const pairs = Array.from({ length: N }, () => {
  const p = () => ({
    lat: minLat + (maxLat - minLat) * (0.25 + 0.5 * rnd()),
    lon: minLon + (maxLon - minLon) * (0.25 + 0.5 * rnd()),
  });
  return [p(), p()] as const;
});
const clock = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1] ?? NaN;

/** Arrivals (null: none) and ms per trip leaving at `leave` on a file. */
function run(tt: [PreparedTimetable, PreparedTimetable], leave: number) {
  const ms: number[] = [];
  const arrive = pairs.map(([a, b]) => {
    const t0 = performance.now();
    const t = tripBetween(tt[0], tt[1], a, b, { leave }, opts);
    ms.push(performance.now() - t0);
    return t ? t.arrive : null;
  });
  return { arrive, ms: median(ms) };
}

function compare(
  label: string,
  leave: number,
  rolled: ReturnType<typeof run>,
  other: ReturnType<typeof run>,
) {
  let found = 0,
    otherFound = 0,
    same = 0,
    earlier = 0,
    later = 0;
  const lateBy: number[] = [];
  rolled.arrive.forEach((r, i) => {
    const o = other.arrive[i];
    if (r !== null) found++;
    if (o !== null) otherFound++;
    if (r === null || o === null) return;
    if (Math.abs(r - o) < 60) same++;
    else if (r < o) earlier++;
    else {
      later++;
      lateBy.push((r - o) / 60);
    }
  });
  console.log(
    `| ${clock(leave)} | ${label} | ${found} / ${otherFound} | ${same} | ${earlier} | ${later}${lateBy.length ? ` (median ${median(lateBy).toFixed(0)} min)` : ''} | ${rolled.ms.toFixed(1)} / ${other.ms.toFixed(1)} |`,
  );
}

console.log(`${N} pairs. Found: rolled / other file. Same: arrives within a minute.`);
console.log('| leave | against | found | same | earlier | later | ms per trip |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
// Chosen 17 Uhr: from 18:00 on the 18 Uhr file; 19:xx is new (it used to stop at 19:00).
const f18 = both('weekday-18');
const f19 = both('weekday-19');
for (const leave of [18.5 * 3600, 19.1 * 3600, 19.8 * 3600])
  compare("the hour's own file", leave, run(f18, leave), run(leave < 19 * 3600 ? f18 : f19, leave));
// Chosen 23 Uhr: past midnight on the next day's 0 Uhr, a day later.
const f23 = both('weekday-23');
const f00 = both('weekday-00', 86400);
const f01 = both('weekday-01', 86400);
for (const leave of [24.2 * 3600, 24.8 * 3600, 25.5 * 3600]) {
  const rolled = run(f00, leave);
  compare('the 23 Uhr file (before)', leave, rolled, run(f23, leave));
  if (leave >= 25 * 3600) compare("the hour's own file", leave, rolled, run(f01, leave));
}
