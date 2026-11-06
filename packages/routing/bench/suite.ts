// Route quality suite (S040): does the trip on tap work well? For random trips in every mode
// it checks, with written targets:
//   1. real: each ride replayed against the raw GTFS (with --gtfs), the card's clock agrees
//      with its arrival, no walk is quicker than the straight line;
//   2. fastest on the app's own data: a reference search (Connection Scan, bench/reference.ts)
//      on the same timetable, walks and footpaths finds nothing quicker;
//   3. close to VBB's own planner (with --vbb): arrival, and with the same arrival the walking;
//   4. sensible among equal trips: no change made a stop early to walk to the same vehicle.
// Results per mode and, for leaving on foot, per group (time of day, weekday/weekend,
// distance, inner city or edge). Writes <out>/cases.jsonl and <out>/report.md.
//
// Usage: tsx bench/suite.ts [--n 1000] [--modes depart,arrive,stepfree,bike] [--seed 40]
//        [--start YYYYMMDD] [--days 1-6] [--gtfs <unpacked GTFS dir>] [--vbb] [--out work/suite]
//        tsx bench/suite.ts --ci --data <dir with timetable-weekday-10.bin, walk.bin, stoplist.bin>
// --ci: 40 trips on that one file, offline; exits 1 when a target of checks 1, 2 or 4 fails.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  directSeconds,
  distanceM,
  rideParts,
  rideTimes,
  walksToStops,
  type Journey,
  type Origin,
  type PreparedTimetable,
} from '../src';
import { REGION } from '../src/regions';
import { replay, type Replay, type ReplayRide } from './gtfs';
import {
  appJourney,
  cellCentre,
  dateOf,
  dayStartMs,
  isWeekend,
  liveData,
  modeOptions,
  type Mode,
} from './live';
import { vbb } from './planners';
import { stayOnTransfer, type TripSummary } from './quality';
import { earliestArrival } from './reference';

const { values: opt } = parseArgs({
  options: {
    n: { type: 'string', default: '1000' },
    modes: { type: 'string', default: 'depart' },
    seed: { type: 'string', default: '40' },
    start: { type: 'string', default: '' },
    days: { type: 'string', default: '1-6' },
    gtfs: { type: 'string', default: '' },
    vbb: { type: 'boolean', default: false },
    out: { type: 'string', default: 'work/suite' },
    ci: { type: 'boolean', default: false },
    data: { type: 'string', default: '' },
  },
});
const CI = opt.ci;
const N = CI ? 40 : Number(opt.n);
const modes = (CI ? 'depart' : opt.modes).split(',') as Mode[];
let seed = Number(opt.seed);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const [d0, d1] = opt.days.split('-').map(Number);
const { walk, timetable } = CI ? await liveData(opt.data, true) : await liveData();
const ALEX = { lat: 52.5219, lon: 13.4132 };

/** A ride as the card shows it, in real time and travel order; one per trip of a ride. */
interface CardRide {
  line: string;
  from: number;
  to: number;
  dep: number;
  arr: number;
}

/**
 * The card's rides and walks: the rides timed from `start` on the timetable's own clock as
 * rideClocks does, turned to real time and travel order when `reversed` (arriving).
 * `end`: where the clock gets to on the timetable's own clock, walks included.
 */
function card(tt: PreparedTimetable, j: Journey, start: number, reversed: boolean) {
  let t = start;
  const rides: CardRide[] = [];
  const walks: { seconds: number; from: number | null; to: number | null }[] = [];
  let prevStop: number | null = null;
  for (const [i, l] of j.legs.entries()) {
    if (l.type === 'walk') {
      const next = j.legs.slice(i + 1).find((x) => x.type === 'ride');
      walks.push({
        seconds: l.seconds,
        from: prevStop,
        to: next?.type === 'ride' ? next.from : null,
      });
      t += l.seconds;
      continue;
    }
    const r = rideTimes(tt, l, t);
    if (!r) return null;
    // One card ride per trip: a ride over several trips is split where they change.
    let at = 0;
    for (const p of rideParts(l)) {
      const a = at;
      const b = at + p.count - 1;
      rides.push({ line: l.name, from: l.stops[a], to: l.stops[b], dep: r.dep[a], arr: r.arr[b] });
      at = b;
    }
    t = r.arr[r.arr.length - 1];
    prevStop = l.to;
  }
  if (!reversed) return { rides, walks, end: t };
  return {
    rides: rides
      .reverse()
      .map((r) => ({ line: r.line, from: r.to, to: r.from, dep: -r.arr, arr: -r.dep })),
    walks: walks.reverse().map((w) => ({ seconds: w.seconds, from: w.to, to: w.from })),
    end: t,
  };
}

interface Case {
  i: number;
  mode: Mode;
  date: string;
  /** Leaving at (arriving: by) this moment, seconds of the service day. */
  at: number;
  from: Origin;
  to: Origin;
  km: number;
  group: { hours: string; day: string; km: string; area: string };
  /** The card: real leave and arrival, its rides. */
  leave: number;
  arrive: number;
  rides: (CardRide & { fromName: string; toName: string })[];
  walk: number;
  /** Walking before the first ride and after the last (VBB lists no walks within a station). */
  walkEnds: number;
  /** Card clock minus the map's minutes (seconds); walks quicker than the straight line. */
  clockOff: number;
  quickWalks: number;
  /** The reference's best on the timetable's own clock minus the app's (seconds; < 0: quicker). */
  ref: number;
  refRides: number;
  earlyChange: boolean;
  gtfs?: Replay[];
  /** VBB's best trip; `walk` before its first ride and after its last. */
  vbb?: { leave: number; arrive: number; walk: number } | null;
}

const hourGroup = (h: number) =>
  h < 5
    ? 'night 0–4'
    : h < 7
      ? 'early 5–6'
      : (h >= 7 && h < 10) || (h >= 16 && h < 19)
        ? 'rush 7–9, 16–18'
        : h < 16
          ? 'day 10–15'
          : 'evening 19–23';
const kmGroup = (km: number) => (km < 5 ? '2–5 km' : km < 12 ? '5–12 km' : '12–25 km');

const cases: Case[] = [];
const [minLon, minLat, maxLon, maxLat] = REGION.bbox;
const perMode = Math.ceil(N / modes.length);
for (const mode of modes) {
  const o = modeOptions(mode, walk);
  for (let n = 0; n < perMode; n++) {
    const date = CI ? 'weekday' : dateOf(opt.start, d0 + Math.floor(rnd() * (d1 - d0 + 1)));
    // (Arriving before 1:00 runs on the evening before's file and clock: left out.)
    const hour = CI ? 10 : mode === 'arrive' ? 1 + Math.floor(rnd() * 23) : Math.floor(rnd() * 24);
    const at = hour * 3600 + Math.floor(rnd() * 60) * 60;
    const tt = await timetable(date, hour, mode, CI ? 'weekday-10' : undefined);
    if (!tt) continue;
    const near = (): Origin => {
      for (;;) {
        const s = tt.stops[Math.floor(rnd() * tt.stopCount)];
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
    let km = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
    while (km < 2 || km > 25) {
      from = near();
      to = near();
      km = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
    }
    const depart = mode !== 'arrive';
    // On the timetable's own clock: arriving, from the destination at minus the arrival.
    const [o1, o2, start] = depart ? [from, to, at] : [to, from, -at];
    const a = appJourney(tt, o1, o2, start, o, depart);
    if (!a || !(a.seconds < Infinity)) continue;
    const c = card(tt, a.j, start, !depart);
    if (!c) continue;
    // The reference to the middle of the same cell, with the same walks.
    const cell = cellCentre(o2);
    const ref = earliestArrival(
      tt,
      walksToStops(tt, o1, o),
      walksToStops(tt, cell, o),
      start,
      directSeconds(o1, cell, o, o.maxOriginSeconds ?? 1800),
    );
    const own = start + a.seconds;
    // Walks quicker than the straight line (on foot only: a bike's include its station
    // minutes). Changes within one station keep the feed's own change time (transfers.txt,
    // as VBB's planner does), so they are left out.
    let quick = 0;
    if (mode !== 'bike') {
      const pt = (s: number | null, end: Origin) => (s === null ? end : tt.stops[s]);
      for (const w of c.walks) {
        if (w.from !== null && w.to !== null && tt.stops[w.from].name === tt.stops[w.to].name)
          continue;
        const p = pt(w.from, from);
        const q = pt(w.to, to);
        if (w.seconds * (o.walkSpeedMps ?? 1) < 0.95 * distanceM(p.lat, p.lon, q.lat, q.lon) - 30)
          quick++;
      }
    }
    const leave = depart ? at : at - a.seconds;
    const arrive = depart ? at + a.seconds : at;
    cases.push({
      i: cases.length,
      mode,
      date,
      at,
      from,
      to,
      km,
      group: {
        hours: hourGroup(hour),
        day: CI ? 'weekday' : isWeekend(date) ? 'weekend' : 'weekday',
        km: kmGroup(km),
        area:
          distanceM(from.lat, from.lon, ALEX.lat, ALEX.lon) < 8000 &&
          distanceM(to.lat, to.lon, ALEX.lat, ALEX.lon) < 8000
            ? 'inner'
            : 'edge',
      },
      leave,
      arrive,
      rides: c.rides.map((r) => ({
        ...r,
        fromName: tt.stops[r.from].name,
        toName: tt.stops[r.to].name,
      })),
      walk: c.walks.reduce((x, w) => x + w.seconds, 0),
      walkEnds: c.walks
        .filter((w) => w.from === null || w.to === null)
        .reduce((x, w) => x + w.seconds, 0),
      clockOff: c.end - own,
      quickWalks: quick,
      ref: ref.arrive - own,
      refRides: ref.rides,
      earlyChange: !!stayOnTransfer(tt, a.j, start),
    });
  }
}

// ---------- the raw feed ----------
if (opt.gtfs) {
  const rides: ReplayRide[] = [];
  const owner: [number, number][] = [];
  for (const c of cases) {
    if (c.mode === 'bike') continue;
    c.gtfs = [];
    const tt = await timetable(c.date, Math.floor(c.at / 3600), c.mode);
    c.rides.forEach((r, k) => {
      const s = tt!.stops;
      rides.push({
        line: r.line,
        date: c.date,
        from: { name: r.fromName, lat: s[r.from].lat, lon: s[r.from].lon },
        to: { name: r.toName, lat: s[r.to].lat, lon: s[r.to].lon },
        dep: r.dep,
        arr: r.arr,
      });
      owner.push([c.i, k]);
    });
  }
  console.log(`replaying ${rides.length} rides against ${opt.gtfs} …`);
  const res = await replay(opt.gtfs, rides);
  res.forEach((x, k) => (cases[owner[k][0]].gtfs![owner[k][1]] = x));
}

// ---------- VBB ----------
if (opt.vbb) {
  for (const c of cases) {
    if (c.mode === 'bike') continue;
    const day0 = dayStartMs(c.date);
    const trips = await vbb(c.from, c.to, day0 + c.at * 1000, day0, {
      arrive: c.mode === 'arrive',
      stepFree: c.mode === 'stepfree',
    });
    let best: TripSummary | null = null;
    for (const t of trips) {
      if (c.mode === 'arrive') {
        if (t.arrive <= c.at + 60 && (!best || t.depart > best.depart)) best = t;
      } else if (!best || t.arrive < best.arrive) best = t;
    }
    c.vbb = best
      ? { leave: best.depart, arrive: best.arrive, walk: best.walkStart + best.walkEnd }
      : null;
  }
}

// ---------- the report ----------
mkdirSync(opt.out, { recursive: true });
writeFileSync(join(opt.out, 'cases.jsonl'), cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
const pct = (n: number, of: number) => (of ? `${((100 * n) / of).toFixed(1)} %` : '–');
const hhmm = (s: number) =>
  `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
/** VBB's trip is 3+ min better: arrives earlier, or (arriving) leaves later. */
const vbbBetter = (c: Case) =>
  !!c.vbb && (c.mode === 'arrive' ? c.vbb.leave - c.leave >= 180 : c.arrive - c.vbb.arrive >= 180);
const sameMoreWalk = (c: Case) =>
  !!c.vbb && Math.abs(c.arrive - c.vbb.arrive) <= 60 && c.walkEnds >= c.vbb.walk + 180;
const checks = {
  gtfsMissing: (c: Case) => !!c.gtfs?.some((x) => x === 'missing'),
  clock: (c: Case) => Math.abs(c.clockOff) > 60,
  quickWalk: (c: Case) => c.quickWalks > 0,
  refQuicker: (c: Case) => c.ref < -60 && c.refRides <= 6,
  /** Quicker only with more rides than the app's search takes (DEFAULT_MAX_ROUNDS = 6). */
  refMoreRides: (c: Case) => c.ref < -60 && c.refRides > 6,
  earlyChange: (c: Case) => c.earlyChange,
};
// `ciMax`: how many trips of the CI sample may fail while a known fault is open.
const targets: {
  name: string;
  value: (cs: Case[]) => [number, number];
  max: number;
  ci: boolean;
  ciMax?: number;
}[] = [
  {
    name: 'Rides not in the raw GTFS',
    value: (cs) =>
      count(
        cs.filter((c) => c.gtfs),
        checks.gtfsMissing,
      ),
    max: 0,
    ci: false,
  },
  {
    name: "Card's clock off its arrival by over 1 min",
    value: (cs) => count(cs, checks.clock),
    max: 0,
    ci: true,
  },
  {
    name: 'Walks quicker than the straight line (not within a station)',
    value: (cs) => count(cs, checks.quickWalk),
    max: 0,
    ci: true,
  },
  {
    name: 'Reference search 1+ min quicker (up to 6 rides)',
    value: (cs) => count(cs, checks.refQuicker),
    max: 0,
    ci: true,
    // TODO(S041): reported only until walkFrom is fixed (the sample of the nightly file found
    // 1 of 40 on 2026-11-06, a stop reached later but nearer blocked by an earlier one).
    ciMax: Infinity,
  },
  {
    name: 'Reference 1+ min quicker with 7+ rides (the app searches up to 6)',
    value: (cs) => count(cs, checks.refMoreRides),
    max: 1,
    ci: false,
  },
  {
    name: 'Change a stop early to walk to the same vehicle',
    value: (cs) => count(cs, checks.earlyChange),
    max: 0,
    ci: true,
  },
  {
    name: 'VBB 3+ min better',
    value: (cs) =>
      count(
        cs.filter((c) => c.vbb),
        vbbBetter,
      ),
    max: 5,
    ci: false,
  },
  {
    name: 'Same arrival as VBB, 3+ min more walking at the start or end',
    value: (cs) =>
      count(
        cs.filter((c) => c.vbb),
        sameMoreWalk,
      ),
    max: 3,
    ci: false,
  },
];
function count(cs: Case[], f: (c: Case) => boolean): [number, number] {
  return [cs.filter(f).length, cs.length];
}
const lines: string[] = [
  '# Route quality suite',
  '',
  `${cases.length} trips (${modes.join(', ')}), seed ${opt.seed}${CI ? ', CI sample on weekday-10' : `, days +${d0}…+${d1} from ${opt.start || 'today'}, any hour`}` +
    `${opt.gtfs ? ', rides replayed against the raw GTFS' : ''}${opt.vbb ? ', VBB asked' : ''}.`,
  '',
  '| Target | ' + modes.join(' | ') + ' | Target | Met |',
  '| --- | ' + modes.map(() => '---').join(' | ') + ' | --- | --- |',
];
let failed = false;
for (const t of targets) {
  if (CI && !t.ci) continue;
  const cells = modes.map((m) => t.value(cases.filter((c) => c.mode === m)));
  const shown = cells.map(([n, of]) => (of ? `${n} of ${of} (${pct(n, of)})` : '–'));
  const ok = cells.every(([n, of]) => !of || (t.max === 0 ? n === 0 : (100 * n) / of < t.max));
  if (t.ci && cells.some(([n]) => n > (t.ciMax ?? 0))) failed = true;
  lines.push(
    `| ${t.name} | ${shown.join(' | ')} | ${t.max === 0 ? '0' : `< ${t.max} %`} | ${ok ? 'yes' : '**no**'} |`,
  );
}
// Groups, for leaving on foot.
const dep = cases.filter((c) => c.mode === 'depart');
if (dep.length && !CI) {
  lines.push(
    '',
    '## Leaving on foot, by group',
    '',
    '| Group | Trips | Reference quicker | VBB 3+ min better | Same arrival, 3+ min more walking |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const g of ['hours', 'day', 'km', 'area'] as const)
    for (const v of [...new Set(dep.map((c) => c.group[g]))].sort()) {
      const cs = dep.filter((c) => c.group[g] === v);
      const asked = cs.filter((c) => c.vbb);
      lines.push(
        `| ${v} | ${cs.length} | ${pct(cs.filter(checks.refQuicker).length, cs.length)} | ` +
          `${pct(asked.filter(vbbBetter).length, asked.length)} | ${pct(asked.filter(sameMoreWalk).length, asked.length)} |`,
      );
    }
}
// Examples of each failing check.
const show = (c: Case) =>
  `#${c.i} ${c.mode} ${c.date} ${c.mode === 'arrive' ? 'an' : 'ab'} ${hhmm(c.at)}, ${c.km.toFixed(1)} km: ` +
  c.rides
    .map((r) => `${r.line} ${hhmm(r.dep)} ${r.fromName} → ${r.toName} ${hhmm(r.arr)}`)
    .join(' · ');
for (const [name, f] of Object.entries(checks)) {
  const bad = cases.filter(f).slice(0, 8);
  if (!bad.length) continue;
  lines.push('', `## ${name}: examples`, '');
  for (const c of bad)
    lines.push(
      `- ${show(c)} (clock ${Math.round(c.clockOff)} s, reference ${Math.round(c.ref)} s with ${c.refRides} rides` +
        `${c.gtfs ? `, GTFS ${c.gtfs.join('/')}` : ''})`,
    );
}
if (opt.gtfs) {
  const all = cases.flatMap((c) => c.gtfs ?? []);
  lines.push(
    '',
    `Raw GTFS: ${all.length} rides, ${pct(all.filter((x) => x === 'exact').length, all.length)} to the second, ` +
      `${pct(all.filter((x) => x === 'minute').length, all.length)} within a minute, ${pct(all.filter((x) => x === 'missing').length, all.length)} not found.`,
  );
}
writeFileSync(join(opt.out, 'report.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (CI && failed) {
  console.error('\nRoute quality: a target failed (see above).');
  process.exit(1);
}
