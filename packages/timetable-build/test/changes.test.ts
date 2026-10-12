import { describe, expect, it } from 'vitest';
import { dayClass, findChanges, type WatchedTrip } from '../src/changes.ts';
import { addDays } from '../src/calendar.ts';

// A line A–B–C–D–E–F (stations 0–5) and a tram line X–Y–Z (6–8), both every day, from
// Monday 12 October 2026. Service "works" (no U1 at C and D) only runs 12–14 October
// and its buses with them; on those days the usual service "u1" does not run.
const names = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'Z'];
const stations = (i: number) => ({ name: names[i]!, lat: 52.5, lon: 13.3 + i / 100 });
const lines = new Map([
  ['796|U1', { name: 'U1', mode: 'ubahn' as const }],
  ['796|M9', { name: 'M9', mode: 'tram' as const }],
]);
const trips: WatchedTrip[] = [
  { line: '796|U1', serviceId: 'u1', stations: [0, 1, 2, 3, 4, 5], replacement: false },
  { line: '796|U1', serviceId: 'u1', stations: [5, 4, 3, 2, 1, 0], replacement: false },
  { line: '796|U1', serviceId: 'works', stations: [0, 1], replacement: false },
  { line: '796|U1', serviceId: 'works', stations: [4, 5], replacement: false },
  { line: '796|U1', serviceId: 'works', stations: [1, 2, 3, 4], replacement: true },
  { line: '796|M9', serviceId: 'm9', stations: [6, 7, 8], replacement: false },
];
const works = new Set(['20261012', '20261013', '20261014']);
const isActive = (id: string, date: string) =>
  id === 'works' ? works.has(date) : id === 'u1' ? !works.has(date) : date !== '20261013';
const dates = Array.from({ length: 4 }, (_, i) => addDays('20261012', i));

describe('what runs differently', () => {
  const changes = findChanges({ trips, lines, stations, isActive, dates, feedEnd: '20261231' });

  it('finds the closed stretch with the stations on either side, replacement and end', () => {
    expect(changes['20261012']).toEqual([
      {
        line: 'U1',
        mode: 'ubahn',
        kind: 'gap',
        replacement: true,
        from: 'B',
        to: 'E',
        until: '2026-10-14',
        path: [1, 2, 3, 4].map((i) => [stations(i).lon, stations(i).lat]),
        gone: [1, 2],
      },
    ]);
  });

  it('lists a line that does not run at all, after the U-Bahn', () => {
    expect(changes['20261013']!.map((c) => [c.line, c.kind, c.until])).toEqual([
      ['U1', 'gap', '2026-10-14'],
      ['M9', 'off', '2026-10-13'],
    ]);
  });

  it('says nothing on a usual day', () => {
    expect(changes['20261015']).toEqual([]);
  });

  it('takes the usual pattern from most days of the weeks ahead', () => {
    const short = findChanges({ trips, lines, stations, isActive, dates, feedEnd: '20261014' });
    // Only three days in the horizon, all with the works: they are the usual pattern then.
    expect(short['20261012']).toEqual([]);
  });

  it('sorts days into weekdays, Saturdays and Sundays with holidays', () => {
    expect(['20261012', '20261017', '20261018', '20261003'].map(dayClass)).toEqual([
      'wd',
      'sa',
      'su',
      'su',
    ]);
  });
});
