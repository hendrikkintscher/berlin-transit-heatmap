import { describe, expect, it } from 'vitest';
import { bikeTimetable, type Timetable } from '../src';

describe('bikeTimetable', () => {
  it('drops the buses and keeps trains, trams and stops', () => {
    const tt = {
      version: 1,
      window: 'day',
      serviceDate: '2026-10-13',
      windowStart: 36000,
      windowEnd: 43200,
      feedVersion: 'test',
      stops: [
        { id: 'a', name: 'A', lat: 52.5, lon: 13.4 },
        { id: 'b', name: 'B', lat: 52.51, lon: 13.4 },
      ],
      routes: [
        { name: 'M29', mode: 'bus', stops: [0, 1], trips: [[36000, 36300]] },
        { name: 'U8', mode: 'ubahn', stops: [0, 1], trips: [[36000, 36120]] },
        { name: 'M10', mode: 'tram', stops: [1, 0], trips: [[36000, 36200]] },
      ],
      transfers: [],
    } satisfies Timetable;
    const bike = bikeTimetable(tt);
    expect(bike.routes.map((r) => r.name)).toEqual(['U8', 'M10']);
    expect(bike.stops).toBe(tt.stops);
  });
});
