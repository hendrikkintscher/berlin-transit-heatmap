// Rolling on (S003): a missed connection asks for the next one leaving at the clock's time,
// on the clock hour's file (past midnight the next day's hour, its times read a day later),
// as rolledWindow in packages/web/src/when.ts. Before S003 it stayed on the hour after the
// chosen one, which stops holding trips two hours after its hour. For random pairs of
// places, the trip leaving at a few clock times on the rolled file against the clock hour's
// own file (the best there is) and against the file used before; with the time per trip.
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

/** The file a card on `day` at `chosen` Uhr rolls on with at `leave` (rolledWindow). */
const files = new Map<string, [PreparedTimetable, PreparedTimetable]>();
function file(day: string, hour: number) {
  const key = `${day}-${String(hour % 24).padStart(2, '0')}`;
  let f = files.get(key);
  if (!f) files.set(key, (f = both(key, hour >= 24 ? 86400 : 0)));
  return f;
}
const rolled = (day: string, chosen: number, leave: number) =>
  file(day, Math.min(Math.floor(leave / 3600), chosen + 2));

console.log(`${N} pairs. Found: rolled / other file. Same: arrives within a minute.`);
console.log('| leave | against | found | same | earlier | later | ms per trip |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
// Chosen 17 Uhr: from 18:00 on the 18 Uhr file, from 19:00 on the 19 Uhr file.
// Chosen 23 Uhr: past midnight on the next day's 0 Uhr, from 1:00 on its 1 Uhr, a day later.
for (const chosen of [17, 23]) {
  for (const h of [1.2, 1.8, 2.1, 2.5, 2.8]) {
    const leave = (chosen + h) * 3600;
    const r = run(rolled('weekday', chosen, leave), leave);
    compare("the hour's own file", leave, r, run(file('weekday', Math.floor(leave / 3600)), leave));
    if (h > 2) compare('the file before S003', leave, r, run(file('weekday', chosen + 1), leave));
  }
}
