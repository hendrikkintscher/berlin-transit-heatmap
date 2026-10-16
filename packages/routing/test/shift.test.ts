import { describe, expect, it } from 'vitest';
import { shiftTimetable, type Timetable } from '../src';

const tt: Timetable = {
  version: 1,
  window: '20261017-00',
  serviceDate: '2026-10-17',
  windowStart: 0,
  windowEnd: 3600,
  feedVersion: 't',
  stops: [
    { id: 'a', name: 'A', lat: 52.5, lon: 13.4 },
    { id: 'b', name: 'B', lat: 52.5, lon: 13.41 },
  ],
  routes: [
    {
      name: 'N1',
      mode: 'bus',
      stops: [0, 1],
      trips: [[600, 900]],
      dwells: [[0, 30]],
    },
  ],
  transfers: [{ from: 0, to: 1, seconds: 60 }],
};

describe('shiftTimetable', () => {
  const next = shiftTimetable(tt, 86400);

  it("reads the next day's times in the day before's terms", () => {
    expect(next.windowStart).toBe(86400);
    expect(next.windowEnd).toBe(90000);
    expect(next.routes[0]!.trips).toEqual([[87000, 87300]]);
  });

  it('keeps stops, dwells and footpaths, and leaves the original as it was', () => {
    expect(next.routes[0]!.dwells).toEqual([[0, 30]]);
    expect(next.transfers).toBe(tt.transfers);
    expect(tt.routes[0]!.trips).toEqual([[600, 900]]);
  });
});
