// Route quality check (S036): the app's trip on tap against VBB's own journey planner (HAFAS,
// via v6.vbb.transport.rest) and Transitous (MOTIS, api.transitous.org), for random places and
// random times on the coming days, all on planned times (no delays). Writes every case to
// <out>/cases.jsonl and a summary to <out>/report.md; the providers' answers are cached in
// <data>/providers/, so a rerun with the same seed asks nobody again.
//
// Usage: tsx bench/providers.ts [--n 200] [--seed 1] [--out work/quality] [--days 1-6]
//        [--hours 6-23] [--only vbb|transitous] [--start YYYYMMDD]
//
// The app's side follows the worker's trip on tap for "ab HH:MM" (web/src/worker-trips.ts):
// one RAPTOR pass leaving at that minute, a grid of the cells around the destination only, the
// journey to its cell and the later start of laterStart; on foot at 5 km/h, every walk up to
// 30 min (FASTEST_WALK). Data: the live site's hourly files for those dates, its stop list and
// footpaths, kept in <data>/live/ (as scripts/layout/screens.mjs keeps them).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { distanceM, walksToStops, type Origin } from '../src';
import { REGION } from '../src/regions';
import { appJourney, dateOf, dayStartMs, liveData, modeOptions } from './live';
import { transitous, vbb } from './planners';
import {
  appTrip,
  bestOf,
  stayOn,
  stayOnTransfer,
  walkTotal,
  why,
  type TripSummary,
} from './quality';

const { values: opt } = parseArgs({
  options: {
    n: { type: 'string', default: '200' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string', default: 'work/quality' },
    days: { type: 'string', default: '1-6' },
    hours: { type: 'string', default: '6-23' },
    only: { type: 'string', default: '' },
    // The day the --days count from (YYYYMMDD; default today in Berlin): the same start and
    // seed ask the same questions, so a rerun reads them all from the cache.
    start: { type: 'string', default: '' },
  },
});

let seed = Number(opt.seed);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const range = (s: string) => s.split('-').map(Number) as [number, number];
const { walk, timetable: timetableFor } = await liveData();
const timetable = (date: string, hour: number) => timetableFor(date, hour, 'depart');
const w = modeOptions('depart', walk);

// ---------- the run ----------
const N = Number(opt.n);
const [d0, d1] = range(opt.days);
const [h0, h1] = range(opt.hours);
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
mkdirSync(opt.out, { recursive: true });
const cases: Case[] = [];

interface Case {
  i: number;
  date: string;
  leave: number;
  from: Origin;
  to: Origin;
  km: number;
  app: (TripSummary & { merged: number }) | null;
  clockOff: number;
  stay: ReturnType<typeof stayOn>;
  stayTransfer: ReturnType<typeof stayOnTransfer>;
  vbb: TripSummary | null;
  transitous: TripSummary | null;
}

const hhmm = (s: number) =>
  `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;

for (let i = 0; i < N; i++) {
  const date = dateOf(opt.start, d0 + Math.floor(rnd() * (d1 - d0 + 1)));
  const hour = h0 + Math.floor(rnd() * (h1 - h0 + 1));
  const leave = hour * 3600 + Math.floor(rnd() * 60) * 60;
  const tt = await timetable(date, hour);
  if (!tt) {
    console.log(`#${i} ${date}-${hour}: no timetable file on the live site`);
    continue;
  }
  // Two places near random stops (up to 400 m off), 2 to 25 km apart, inside the region.
  const near = (): Origin => {
    for (;;) {
      const s = tt.stops[Math.floor(rnd() * tt.stops.length)];
      if (s.lon < minLon || s.lon > maxLon || s.lat < minLat || s.lat > maxLat) continue;
      const a = rnd() * 2 * Math.PI;
      const m = rnd() * 400;
      return {
        lat: s.lat + (m * Math.cos(a)) / 111320,
        lon: s.lon + (m * Math.sin(a)) / (111320 * Math.cos((s.lat * Math.PI) / 180)),
      };
    }
  };
  let from = near();
  let to = near();
  while (
    distanceM(from.lat, from.lon, to.lat, to.lon) < 2000 ||
    distanceM(from.lat, from.lon, to.lat, to.lon) > 25000
  ) {
    from = near();
    to = near();
  }
  const km = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
  const day0 = dayStartMs(date);
  const a = appJourney(tt, from, to, leave, w, true);
  const app = a ? appTrip(tt, a.j, leave) : null;
  // The trip card's ride clocks (each ride on the next vehicle of its own route, as
  // rideClocks does for the card) against the map's minutes, which the card's arrival shows.
  const clockOff = a && app ? app.arrive - (leave + a.seconds) : 0;
  if (a && app) app.arrive = leave + a.seconds;
  const stay = a ? stayOn(tt, a.j, leave, walksToStops(tt, to, w)) : null;
  const stayTransfer = a ? stayOnTransfer(tt, a.j, leave) : null;
  const leaveMs = day0 + leave * 1000;
  const v = opt.only && opt.only !== 'vbb' ? null : bestOf(await vbb(from, to, leaveMs, day0));
  const t =
    opt.only && opt.only !== 'transitous'
      ? null
      : bestOf(await transitous(from, to, leaveMs, day0));
  const c: Case = {
    i,
    date,
    leave,
    from,
    to,
    km,
    app,
    clockOff,
    stay,
    stayTransfer,
    vbb: v,
    transitous: t,
  };
  cases.push(c);
  const d = (r: TripSummary | null) =>
    app && r ? `${Math.round((app.arrive - r.arrive) / 60)}` : '–';
  console.log(
    `#${i} ${date} ${hhmm(leave)} ${km.toFixed(1)} km: app ${app ? hhmm(app.arrive) : '–'}` +
      ` vbb ${d(v)} transitous ${d(t)} min${stay ? ` · stay on to ${stay.stop}` : ''}` +
      `${stayTransfer ? ` · change later at ${stayTransfer.stop}` : ''}`,
  );
}
writeFileSync(join(opt.out, 'cases.jsonl'), cases.map((c) => JSON.stringify(c)).join('\n') + '\n');

// ---------- the report ----------
const median = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : NaN);
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)} %` : '–');
const ride = (t: TripSummary) =>
  [
    t.walkStart > 30 ? `walk ${Math.round(t.walkStart / 60)}` : '',
    ...t.rides.map((r) => `${r.line} ${hhmm(r.dep)} ${r.from} → ${r.to} ${hhmm(r.arr)}`),
    t.walkEnd > 30 ? `walk ${Math.round(t.walkEnd / 60)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
const lines: string[] = [
  `# Route quality check`,
  '',
  `${cases.length} random trips, seed ${opt.seed}, days +${d0}…+${d1}, leaving ${h0}:00–${h1}:59, ` +
    'planned times. Δ = the app arrives minus the planner arrives (minutes; > 0: the app is later).',
  '',
  '| Planner | Trips compared | Median Δ | App 3+ min later | App 5+ min later | App 3+ min earlier | Same arrival (±1 min), app walks 3+ min more at the start or end | Same arrival, app leaves 10+ min earlier |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];
const worse: { c: Case; p: string; ref: TripSummary; d: number }[] = [];
/** Arrives within a minute of the planner's trip; the walks at the two ends. */
const same = (c: Case, p: 'vbb' | 'transitous') => Math.abs(c.app!.arrive - c[p]!.arrive) <= 60;
const ends = (t: TripSummary) => t.walkStart + t.walkEnd;
for (const p of ['vbb', 'transitous'] as const) {
  const both = cases.filter((c) => c.app && c[p]);
  const d = both.map((c) => (c.app!.arrive - c[p]!.arrive) / 60);
  lines.push(
    `| ${p === 'vbb' ? 'VBB (HAFAS)' : 'Transitous (MOTIS)'} | ${both.length} | ${median(d).toFixed(1)} | ` +
      `${pct(d.filter((x) => x >= 3).length, d.length)} | ${pct(d.filter((x) => x >= 5).length, d.length)} | ` +
      `${pct(d.filter((x) => x <= -3).length, d.length)} | ` +
      `${pct(both.filter((c) => same(c, p) && ends(c.app!) >= ends(c[p]!) + 180).length, both.length)} | ` +
      `${pct(both.filter((c) => same(c, p) && c.app!.depart <= c[p]!.depart - 600).length, both.length)} |`,
  );
  for (const c of both) {
    const x = (c.app!.arrive - c[p]!.arrive) / 60;
    if (x >= 3) worse.push({ c, p, ref: c[p]!, d: x });
  }
}
const appTrips = cases.filter((c) => c.app);
const stays = appTrips.filter((c) => c.stay);
const later = appTrips.filter((c) => c.stayTransfer);
const merged = appTrips.filter((c) => c.app!.merged);
const off = appTrips.filter((c) => Math.abs(c.clockOff) > 60);
lines.push(
  '',
  `**Trip card clock:** ${merged.length} of ${appTrips.length} trips have a ride that changes trips on the way ` +
    '(the Ring at Beusselstr.). Timed as the card times them, the rides arrive over 1 min away from the ' +
    `card's arrival (the map's minutes) in ${off.length}` +
    (off.length
      ? `: ${off.map((c) => `#${c.i} (${Math.round(c.clockOff / 60)} min)`).join(', ')}`
      : '') +
    ". Δ uses the card's arrival. Walks inside a station: VBB lists none (its change time is waiting), " +
    'so walks between rides are not compared.',
  '',
  `**Staying on the last vehicle** (the app's own data): in ${stays.length} of ${appTrips.length} trips ` +
    `(${pct(stays.length, appTrips.length)}) a later stop of the same vehicle arrives at most 1 min later ` +
    'with at least 2 min less walking.',
  '',
  `**Changing later** (the app's own data): in ${later.length} of ${appTrips.length} trips ` +
    `(${pct(later.length, appTrips.length)}) staying on a vehicle to a later stop catches the same next ` +
    'vehicle with at least 2 min less walking between them (same arrival).',
  '',
  '## Why the app is 3+ min later',
  '',
  '| Class | VBB | Transitous |',
  '| --- | --- | --- |',
);
const classes = ['stay-on', 'longer-walk', 'same-lines', 'fewer-rides', 'other-lines'] as const;
for (const k of classes)
  lines.push(
    `| ${k} | ${worse.filter((x) => x.p === 'vbb' && why(x.c.app!, x.ref, !!(x.c.stay || x.c.stayTransfer)) === k).length} | ` +
      `${worse.filter((x) => x.p === 'transitous' && why(x.c.app!, x.ref, !!(x.c.stay || x.c.stayTransfer)) === k).length} |`,
  );
lines.push('', '## The worst cases', '');
for (const x of worse.sort((a, b) => b.d - a.d).slice(0, 25)) {
  const c = x.c;
  const link =
    `https://hendrikkintscher.github.io/berlin-transit-heatmap/?from=${c.from.lat.toFixed(5)},${c.from.lon.toFixed(5)}` +
    `&to=${c.to.lat.toFixed(5)},${c.to.lon.toFixed(5)}`;
  lines.push(
    `- **#${c.i}** ${c.date} ab ${hhmm(c.leave)}, ${c.km.toFixed(1)} km, ${x.p} ${Math.round(x.d)} min earlier ` +
      `(${why(c.app!, x.ref, !!(c.stay || c.stayTransfer))}) · [map](${link})`,
    `  - app ${hhmm(c.app!.arrive)}: ${ride(c.app!)} (walk ${Math.round(walkTotal(c.app!) / 60)} min)`,
    `  - ${x.p} ${hhmm(x.ref.arrive)}: ${ride(x.ref)} (walk ${Math.round(walkTotal(x.ref) / 60)} min)`,
  );
}
if (stays.length) {
  lines.push('', '## Staying on: examples', '');
  for (const c of stays.slice(0, 15))
    lines.push(
      `- **#${c.i}** ${c.date} ab ${hhmm(c.leave)}: app ${ride(c.app!)}, arrives ${hhmm(c.app!.arrive)}; ` +
        `staying on ${c.stay!.further} stop(s) to ${c.stay!.stop} arrives ${hhmm(c.stay!.arrive)} ` +
        `with ${Math.round(c.stay!.walkEnd / 60)} min walk instead of ${Math.round(c.app!.walkEnd / 60)}`,
    );
}
if (later.length) {
  lines.push('', '## Changing later: examples', '');
  for (const c of later.slice(0, 15)) {
    const x = c.stayTransfer!;
    lines.push(
      `- **#${c.i}** ${c.date} ab ${hhmm(c.leave)}: off the ${x.line} at ${x.getOff}, ` +
        `${Math.round(x.walk / 60)} min walk to the ${x.next}; staying on ${x.further} stop(s) to ${x.stop} ` +
        `catches the same ${x.next} with ${Math.round(x.walkThere / 60)} min walk`,
    );
  }
}
writeFileSync(join(opt.out, 'report.md'), lines.join('\n') + '\n');
console.log(`\n${lines.slice(0, 12).join('\n')}\n\nReport: ${join(opt.out, 'report.md')}`);
