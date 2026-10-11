import { describe, expect, it } from 'vitest';
import { stepFreeTimetable, type Timetable } from '../src';

const tt: Timetable = {
  version: 1,
  window: 'day',
  serviceDate: '2026-10-13',
  windowStart: 36000,
  windowEnd: 43200,
  feedVersion: 't',
  stops: [
    { id: 'a', name: 'A', lat: 52.5, lon: 13.4 },
    { id: 'b', name: 'B', lat: 52.5, lon: 13.41, stepFree: false },
    { id: 'c', name: 'C', lat: 52.5, lon: 13.42 },
  ],
  routes: [
    { name: 'U1', mode: 'ubahn', stops: [0, 1, 2], trips: [[36000, 36060, 36120]] },
    { name: 'M1', mode: 'tram', stops: [0, 2], trips: [[36000, 36300]], stepFree: false },
    { name: 'U2', mode: 'ubahn', stops: [0, 1], trips: [[36000, 36060]] },
  ],
  transfers: [
    { from: 0, to: 1, seconds: 60 },
    { from: 0, to: 2, seconds: 600 },
  ],
};

describe('stepFreeTimetable', () => {
  const sf = stepFreeTimetable(tt);

  it('keeps accessible trips and lets them pass stairs-only platforms', () => {
    expect(sf.routes).toEqual([
      { name: 'U1', mode: 'ubahn', stops: [0, 2], trips: [[36000, 36120]] },
    ]);
  });

  it('drops footpaths to stairs-only platforms and keeps stop indices', () => {
    expect(sf.transfers).toEqual([{ from: 0, to: 2, seconds: 600 }]);
    expect(sf.stops).toBe(tt.stops);
  });
});
