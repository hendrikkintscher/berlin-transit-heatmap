// Route quality suite (S040): each ride of the app's trips replayed against the raw GTFS feed,
// read here on its own (no timetable-build code): a trip of that line runs on that date and
// leaves the ride's first stop and reaches its last one at the times the trip card shows.
// Stops are matched by name and position (the app's stop list carries no GTFS ids).
import { createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

/** One ride as the card shows it; `date` YYYYMMDD; times in seconds of that service day. */
export interface ReplayRide {
  line: string;
  date: string;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  dep: number;
  arr: number;
}

/** What the feed has for a ride: a trip with both times to the second, within a minute, or none. */
export type Replay = 'exact' | 'minute' | 'missing';

/** One CSV line into fields (quotes, and commas inside quotes, as GTFS writes them). */
export function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "25:04:30" → seconds. */
export const gtfsSeconds = (t: string) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

function table(dir: string, name: string): Record<string, string>[] {
  const lines = readFileSync(join(dir, name), 'utf8').split(/\r?\n/).filter(Boolean);
  const head = csvLine(lines[0].replace(/^\uFEFF/, ''));
  return lines.slice(1).map((l) => {
    const f = csvLine(l);
    return Object.fromEntries(head.map((h, i) => [h, f[i] ?? '']));
  });
}

const weekday = (date: string) =>
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`).getUTCDay()
  ];

/** Metres between two points (small distances). */
const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  return Math.hypot(x, (b.lat - a.lat) * k) * 6371000;
};

/** Replays the rides against the feed in `dir` (an unpacked GTFS.zip); one answer per ride. */
export async function replay(dir: string, rides: ReplayRide[], nearM = 30): Promise<Replay[]> {
  const out: Replay[] = rides.map(() => 'missing');
  // Stops by name, for the rides' stops.
  const names = new Set(rides.flatMap((r) => [r.from.name, r.to.name]));
  const stopsByName = new Map<string, { id: string; lat: number; lon: number }[]>();
  for (const s of table(dir, 'stops.txt')) {
    if (!names.has(s.stop_name)) continue;
    const list = stopsByName.get(s.stop_name) ?? [];
    list.push({ id: s.stop_id, lat: Number(s.stop_lat), lon: Number(s.stop_lon) });
    stopsByName.set(s.stop_name, list);
  }
  const ids = (p: ReplayRide['from']) =>
    new Set((stopsByName.get(p.name) ?? []).filter((s) => metres(s, p) <= nearM).map((s) => s.id));
  const wanted = rides.map((r) => ({ from: ids(r.from), to: ids(r.to) }));
  // Which services run on which dates. A ride around midnight may be on the day before's or
  // after's service in the feed: all three are tried.
  const before = (d: string) => {
    const t = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00Z`);
    return new Date(t.getTime() - 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
  };
  const after = (d: string) => {
    const t = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00Z`);
    return new Date(t.getTime() + 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
  };
  const dates = new Set(rides.flatMap((r) => [r.date, before(r.date), after(r.date)]));
  const runs = new Map<string, Set<string>>();
  const add = (service: string, date: string) => {
    const set = runs.get(service) ?? new Set<string>();
    set.add(date);
    runs.set(service, set);
  };
  for (const c of table(dir, 'calendar.txt'))
    for (const d of dates)
      if (c.start_date <= d && d <= c.end_date && c[weekday(d)] === '1') add(c.service_id, d);
  for (const c of table(dir, 'calendar_dates.txt')) {
    if (!dates.has(c.date)) continue;
    if (c.exception_type === '1') add(c.service_id, c.date);
    else runs.get(c.service_id)?.delete(c.date);
  }
  const lines = new Map(table(dir, 'routes.txt').map((r) => [r.route_id, r.route_short_name]));
  const byLine = new Map<string, number[]>();
  rides.forEach((r, i) => byLine.set(r.line, [...(byLine.get(r.line) ?? []), i]));
  // Trips of the rides' lines, with the dates they run on.
  const trips = new Map<string, { line: string; dates: Set<string> }>();
  for (const t of table(dir, 'trips.txt')) {
    const line = lines.get(t.route_id);
    const on = runs.get(t.service_id);
    if (line && byLine.has(line) && on?.size) trips.set(t.trip_id, { line, dates: on });
  }
  // stop_times, one trip at a time (the feed lists them by trip).
  const rl = createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) });
  let head: string[] | null = null;
  let col = { trip: 0, stop: 1, arr: 6, dep: 7 };
  let cur = '';
  let rows: { stop: string; arr: number; dep: number }[] = [];
  const check = () => {
    const t = trips.get(cur);
    if (!t) return;
    for (const i of byLine.get(t.line) ?? []) {
      const r = rides[i];
      const w = wanted[i];
      // On the ride's own day, the evening before's (24:25 for 00:25) or the next one's (00:38
      // for 24:38).
      for (const [date, shift] of [
        [r.date, 0],
        [before(r.date), 86400],
        [after(r.date), -86400],
      ] as const) {
        if (out[i] === 'exact' || !t.dates.has(date)) continue;
        for (let a = 0; a < rows.length; a++) {
          if (!w.from.has(rows[a].stop)) continue;
          const dd = Math.abs(rows[a].dep - r.dep - shift);
          if (dd > 60) continue;
          for (let b = a + 1; b < rows.length; b++) {
            if (!w.to.has(rows[b].stop)) continue;
            const da = Math.abs(rows[b].arr - r.arr - shift);
            if (da > 60) continue;
            if (out[i] !== 'exact') out[i] = dd === 0 && da === 0 ? 'exact' : 'minute';
          }
        }
      }
    }
  };
  for await (const line of rl) {
    if (!head) {
      head = csvLine(line.replace(/^\uFEFF/, ''));
      col = {
        trip: head.indexOf('trip_id'),
        stop: head.indexOf('stop_id'),
        arr: head.indexOf('arrival_time'),
        dep: head.indexOf('departure_time'),
      };
      continue;
    }
    // Fast path: the trip id is the first field (no quotes in VBB's ids).
    const comma = line.indexOf(',');
    const trip = col.trip === 0 ? line.slice(0, comma).replace(/"/g, '') : csvLine(line)[col.trip];
    if (trip !== cur) {
      check();
      cur = trip;
      rows = [];
    }
    if (!trips.has(trip)) continue;
    const f = csvLine(line);
    rows.push({ stop: f[col.stop], arr: gtfsSeconds(f[col.arr]), dep: gtfsSeconds(f[col.dep]) });
  }
  check();
  return out;
}
