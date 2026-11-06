// S042 measurement: footpath variants (no 60 s, capped at 1.3× the straight line, a 600 m
// radius) on the suite's trips leaving on foot, against the cached VBB answers: how often VBB
// is 3+ min better, how often the app is 3+ min earlier (too optimistic?), how many trips move.
// Usage (in packages/routing): tsx bench/footpaths.ts   (needs ../../work/suite-depart from
//   tsx bench/suite.ts --n 1000 --start 20261106 --vbb --out ../../work/suite-depart)
// E1: footpath variants on the suite's trips leaving on foot, against the cached VBB answers.
import { readFileSync } from 'node:fs';
import {
  decodeStopList,
  decodeTimetable,
  distanceM,
  loadTimetable,
  loadWalkNetwork,
  type Timetable,
} from '../src';
import { appJourney, dayStartMs, LIVE_DIR, modeOptions } from './live';
const C = readFileSync('../../work/suite-depart/cases.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .filter((c) => c.vbb);
const walk = loadWalkNetwork(new Uint8Array(readFileSync(LIVE_DIR + '/walk.bin')));
const list = decodeStopList(readFileSync(LIVE_DIR + '/stoplist.bin'));
const o = modeOptions('depart', walk);
const raws = new Map<string, Timetable>();
const raw = (date: string, h: number) => {
  const f = `${LIVE_DIR}/timetable-${date}-${String(h).padStart(2, '0')}.bin`;
  if (!raws.has(f)) raws.set(f, decodeTimetable(readFileSync(f), list) as Timetable);
  return raws.get(f)!;
};
type V = (t: Timetable) => Timetable['transfers'];
const variants: Record<string, V> = {
  today: (t) => t.transfers,
  'no 60 s': (t) => t.transfers.map((x) => ({ ...x, seconds: Math.max(0, x.seconds - 60) })),
  'cap 1.3× straight': (t) =>
    t.transfers.map((x) => {
      const a = t.stops[x.from],
        b = t.stops[x.to];
      const cap = Math.round((1.3 * distanceM(a.lat, a.lon, b.lat, b.lon)) / (5 / 3.6) + 60);
      return { ...x, seconds: Math.min(x.seconds, Math.max(cap, 60)) };
    }),
  'radius 600 m': (t) => {
    const have = new Set(t.transfers.map((x) => x.from * 1e6 + x.to));
    const extra: Timetable['transfers'] = [];
    const S = t.stops;
    const idx = S.map((s, i) => [s.lat, i] as const).sort((a, b) => a[0] - b[0]);
    for (let a = 0; a < idx.length; a++)
      for (let b = a + 1; b < idx.length && idx[b][0] - idx[a][0] < 0.0055; b++) {
        const i = idx[a][1],
          j = idx[b][1];
        const d = distanceM(S[i].lat, S[i].lon, S[j].lat, S[j].lon);
        if (d <= 400 || d > 600) continue;
        const s = Math.round((1.3 * d) / (5 / 3.6) + 60);
        if (!have.has(i * 1e6 + j)) extra.push({ from: i, to: j, seconds: s });
        if (!have.has(j * 1e6 + i)) extra.push({ from: j, to: i, seconds: s });
      }
    return [...t.transfers, ...extra];
  },
};
for (const [name, f] of Object.entries(variants)) {
  const tts = new Map<string, ReturnType<typeof loadTimetable>>();
  let better = 0,
    worse = 0,
    n = 0;
  const gains: number[] = [];
  for (const c of C) {
    const h = Math.floor(c.at / 3600);
    const key = `${c.date}-${h}`;
    if (!tts.has(key)) {
      const r = raw(c.date, h);
      tts.set(key, loadTimetable({ ...r, transfers: f(r) }));
    }
    const a = appJourney(tts.get(key)!, c.from, c.to, c.at, o, true);
    if (!a) continue;
    const arrive = c.at + a.seconds;
    n++;
    if (arrive - c.vbb.arrive >= 180) better++;
    if (c.vbb.arrive - arrive >= 180) worse++;
    gains.push(c.arrive - arrive);
  }
  const moved = gains.filter((g) => g >= 60).length;
  console.log(
    `${name.padEnd(18)} VBB 3+ min better ${((100 * better) / n).toFixed(1)} %, app 3+ min earlier than VBB ${((100 * worse) / n).toFixed(1)} %, trips 1+ min earlier than today ${((100 * moved) / n).toFixed(1)} % (n ${n})`,
  );
  void dayStartMs;
}
