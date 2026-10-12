import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTimetables, type BuildResult } from '../src/build.ts';
import { writeOutputs } from '../src/output.ts';
import { decodeTimetable } from '../../routing/src/ttbin.ts';
import { openGtfs } from '../src/source.ts';
import type { Timetable } from '../src/types.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'mini');
const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 3600 + m! * 60;
};

let result: BuildResult;
let day: Timetable;
let night: Timetable;
const idx = (tt: Timetable, id: string) => tt.stops.findIndex((s) => s.id === id);
const routeNamed = (tt: Timetable, name: string) => tt.routes.filter((r) => r.name === name);
const stopIds = (tt: Timetable, stops: number[]) => stops.map((s) => tt.stops[s]!.id);

beforeAll(async () => {
  const source = await openGtfs(FIXTURE);
  result = await buildTimetables(source, { feedVersion: 'test-feed' });
  source.close();
  day = result.timetables.day!;
  night = result.timetables.night!;
});

describe('buildTimetables on the mini fixture', () => {
  it('picks the first non-holiday Tue–Thu at least 3 days after the feed start', () => {
    // Feed starts Thu 2026-10-08; +3 = Sun 11th, so Tue 13th.
    expect(day.serviceDate).toBe('2026-10-13');
    expect(night.serviceDate).toBe('2026-10-13');
    expect(day.feedVersion).toBe('test-feed');
    expect(day.version).toBe(1);
  });

  it('sets the window bounds in seconds of the service day', () => {
    expect([day.window, day.windowStart, day.windowEnd]).toEqual(['day', 36000, 43200]);
    expect([night.window, night.windowStart, night.windowEnd]).toEqual(['night', 93600, 100800]);
  });

  it('keeps only stops inside the bbox that are served, plus their parent stations', () => {
    expect(day.stops.map((s) => s.id).sort()).toEqual(['A', 'B', 'C', 'E', 'S']);
    expect(night.stops).toEqual(day.stops);
    const a = day.stops[idx(day, 'A')]!;
    expect(a.parent).toBe(idx(day, 'S'));
    expect(day.stops[idx(day, 'C')]!.parent).toBeUndefined();
    expect(a).toMatchObject({ name: 'Station S, platform A', lat: 52.52, lon: 13.4 });
  });

  it('trims stops outside the bbox, removes duplicates and splits overtaking trips', () => {
    const u9 = routeNamed(day, 'U9');
    expect(u9).toHaveLength(2);
    for (const r of u9) expect(stopIds(day, r.stops)).toEqual(['A', 'B', 'C']);
    expect(u9.map((r) => r.trips)).toEqual(
      expect.arrayContaining([
        [
          [t('10:00'), t('10:05'), t('10:10')],
          [t('10:30'), t('10:34'), t('10:40')],
        ],
        [[t('10:31'), t('10:33'), t('10:38')]],
      ]),
    );
    expect(u9[0]!.mode).toBe('ubahn');
  });

  it('applies the time filter [windowStart, windowEnd + 2h]', () => {
    const bus = routeNamed(day, '100');
    const ce = bus.find((r) => r.stops.length === 2)!;
    // 09:00 trip (ends before the window) and 14:30 trip (after +2h) are dropped.
    expect(ce.trips).toEqual([[t('13:30'), t('13:40')]]);
    expect(ce.mode).toBe('bus');
  });

  it('interpolates missing times', () => {
    const cbe = routeNamed(day, '100').find((r) => r.stops.length === 3)!;
    expect(stopIds(day, cbe.stops)).toEqual(['C', 'B', 'E']);
    expect(cbe.trips).toEqual([[t('11:00'), t('11:05'), t('11:10')]]);
  });

  it('skips stops where the vehicle neither picks up nor drops off, and uses long names', () => {
    const [ferry] = routeNamed(day, 'Fähre Wannsee');
    expect(ferry!.mode).toBe('ferry');
    expect(stopIds(day, ferry!.stops)).toEqual(['E', 'C']);
  });

  it('only includes services running on the reference day', () => {
    // t11 runs at weekends only.
    const all = day.routes.flatMap((r) => r.trips);
    expect(all).toHaveLength(6);
  });

  it('builds the night window from same-day 26:xx trips and next-day 02:xx trips', () => {
    expect(night.routes).toHaveLength(1);
    const [n9] = night.routes;
    expect(n9!.name).toBe('N9');
    expect(stopIds(night, n9!.stops)).toEqual(['C', 'E']);
    expect(n9!.trips).toEqual([
      [t('26:15'), t('26:25')],
      [t('26:30'), t('26:40')],
    ]);
  });

  it('builds symmetric footpaths: walking, same station and transfers.txt', () => {
    const byPair = new Map(day.transfers.map((x) => [`${x.from},${x.to}`, x.seconds]));
    const pair = (a: string, b: string) => byPair.get(`${idx(day, a)},${idx(day, b)}`);
    expect(day.transfers).toHaveLength(6);
    expect(pair('A', 'B')).toBe(75); // ~18 m walk + 60 s
    expect(pair('B', 'A')).toBe(75);
    expect(pair('C', 'E')).toBe(277); // ~261 m walk + 60 s
    expect(pair('E', 'C')).toBe(277);
    expect(pair('A', 'C')).toBe(300); // from transfers.txt, mirrored
    expect(pair('C', 'A')).toBe(300);
    expect(pair('A', 'E')).toBeUndefined(); // route-restricted transfer ignored
    expect(night.transfers).toEqual(day.transfers);
  });

  it('sorts trips by first departure and keeps arrays aligned', () => {
    for (const tt of [day, night])
      for (const r of tt.routes) {
        for (const trip of r.trips) expect(trip).toHaveLength(r.stops.length);
        for (let i = 1; i < r.trips.length; i++)
          expect(r.trips[i]![0]).toBeGreaterThanOrEqual(r.trips[i - 1]![0]!);
      }
  });

  it('reports stats', () => {
    expect(result.stats).toMatchObject({ stops: 5, stations: 1 });
    expect(result.stats.windows.day).toEqual({
      routes: 5,
      trips: 6,
      stopTimes: 16,
      transfers: 6,
    });
  });
});

describe('writeOutputs', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'timetable-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('writes the data files, binary timetables and build-info.json', () => {
    const info = writeOutputs(result, dir);
    const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
    expect(read('timetable-day.json')).toEqual(day);
    expect(read('timetable-night.json')).toEqual(night);
    expect(read('stops.json')).toEqual({
      version: 1,
      serviceDate: '2026-10-13',
      feedVersion: 'test-feed',
      stops: day.stops,
    });
    expect(read('build-info.json')).toMatchObject({
      serviceDate: '2026-10-13',
      stats: result.stats,
    });
    // The binary file reads back as the JSON one, without stop ids and with the
    // footpaths in stop order.
    const bin = decodeTimetable(readFileSync(join(dir, 'timetable-day.bin')));
    expect(bin).toEqual({
      ...day,
      stops: day.stops.map((s) => ({ ...s, id: '' })),
      transfers: [...day.transfers].sort((a, b) => a.from - b.from || a.to - b.to),
    });
    expect(read('stop-ids.json')).toMatchObject({ version: 1, feedVersion: 'test-feed' });
    expect(read('stop-ids.json').ids).toHaveLength(day.stops.length);
    expect(Object.keys(info.files).sort()).toEqual([
      'stop-ids.json',
      'stops.json',
      'timetable-day.bin',
      'timetable-day.json',
      'timetable-night.bin',
      'timetable-night.json',
    ]);
  });
});

describe('hourly windows', () => {
  let hourly: BuildResult;
  beforeAll(async () => {
    const source = await openGtfs(FIXTURE);
    hourly = await buildTimetables(source, { feedVersion: 'test-feed', hourly: true });
    source.close();
  });
  const firstTimes = (tt: Timetable, name: string) =>
    routeNamed(tt, name)
      .flatMap((r) => r.trips.map((trip) => trip[0]))
      .sort((a, b) => a! - b!);

  it('builds 24 weekday and 24 weekend hours next to day and night', () => {
    const names = Object.keys(hourly.timetables);
    expect(names).toHaveLength(50);
    expect(names).toContain('weekday-00');
    expect(names).toContain('weekend-23');
    expect(hourly.timetables['weekday-10']).toMatchObject({
      window: 'weekday-10',
      serviceDate: '2026-10-13',
      windowStart: t('10:00'),
      windowEnd: t('11:00'),
    });
  });

  it('uses the following Saturday for the weekend', () => {
    expect(hourly.stats.weekendDate).toBe('2026-10-17');
    expect(hourly.timetables['weekend-10']!.serviceDate).toBe('2026-10-17');
    // Only the weekend bus t11 runs on Saturday morning; the weekday buses do not.
    expect(firstTimes(hourly.timetables['weekend-10']!, '100')).toEqual([t('10:00')]);
    // On a weekday the same hour has the weekday bus t10 (11:00) instead.
    expect(firstTimes(hourly.timetables['weekday-10']!, '100')).toEqual([t('11:00')]);
  });

  it('counts the Friday night bus as Saturday 02:xx', () => {
    // t7 runs on weekdays at 26:30, i.e. 02:30 on Saturday after a Friday.
    expect(firstTimes(hourly.timetables['weekend-02']!, 'N9')).toEqual([t('02:30')]);
  });

  it('keeps one shared stop list for every window', () => {
    for (const tt of Object.values(hourly.timetables))
      expect(tt.stops).toEqual(hourly.stopsFile.stops);
  });
});

describe('real dates', () => {
  let dated: BuildResult;
  let dir: string;
  beforeAll(async () => {
    const source = await openGtfs(FIXTURE);
    dated = await buildTimetables(source, {
      feedVersion: 'test-feed',
      dates: ['20261014', '20261015', '20261017'],
    });
    source.close();
    dir = mkdtempSync(join(tmpdir(), 'tt-dated-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const firstTimes = (tt: Timetable, name: string) =>
    routeNamed(tt, name)
      .flatMap((r) => r.trips.map((trip) => trip[0]))
      .sort((a, b) => a! - b!);

  it('builds 24 hours for each date, counted from that date', () => {
    expect(dated.stats.dates).toEqual(['2026-10-14', '2026-10-15', '2026-10-17']);
    expect(Object.keys(dated.timetables).filter((n) => /^\d{8}-\d{2}$/.test(n))).toHaveLength(72);
    expect(dated.timetables['20261015-10']).toMatchObject({
      window: '20261015-10',
      serviceDate: '2026-10-15',
      windowStart: t('10:00'),
    });
  });

  it('lists what runs differently for each date', () => {
    expect(Object.keys(dated.changes ?? {})).toEqual(['20261014', '20261015', '20261017']);
  });

  it('carries a one-off trip only on its own date', () => {
    // t8 runs only on Wed 14 October (calendar_dates), at 02:15.
    expect(firstTimes(dated.timetables['20261014-02']!, 'N9')).toContain(t('02:15'));
    expect(firstTimes(dated.timetables['20261015-02']!, 'N9')).not.toContain(t('02:15'));
  });

  it('runs the weekend service on a Saturday date', () => {
    expect(firstTimes(dated.timetables['20261017-10']!, '100')).toEqual([t('10:00')]);
  });

  it('writes only the binary file for a date', () => {
    const info = writeOutputs(dated, dir);
    expect(info.files['timetable-20261014-10.bin']).toBeDefined();
    expect(info.files['timetable-20261014-10.json']).toBeUndefined();
    expect(info.files['timetable-day.json']).toBeDefined();
  });
});
