import { describe, expect, it } from 'vitest';
import { decodeTimetable, encodeTimetable, type TimetableData } from '../src';

const tt: TimetableData = {
  version: 1,
  window: 'weekday-10',
  serviceDate: '2026-10-13',
  windowStart: 36000,
  windowEnd: 39600,
  feedVersion: 'test',
  stops: [
    { id: 'a', name: 'S+U Alexanderplatz Bhf (Berlin)', lat: 52.52147, lon: 13.41142 },
    { id: 'b', name: 'U Moritzplatz (Berlin)', lat: 52.50364, lon: 13.41047, stepFree: false },
    { id: 'c', name: 'Gleis 1', lat: 52.52151, lon: 13.4115, parent: 0 },
  ],
  routes: [
    {
      name: 'U8',
      mode: 'ubahn',
      stops: [1, 0],
      trips: [
        [36000, 36300],
        [36300, 36610],
      ],
    },
    {
      name: 'M48',
      mode: 'bus',
      stops: [2, 0, 1],
      trips: [[36100, 36160, 36700]],
      stepFree: false,
    },
  ],
  transfers: [
    { from: 2, to: 0, seconds: 60 },
    { from: 0, to: 2, seconds: 60 },
    { from: 0, to: 1, seconds: 1500 },
  ],
};

describe('binary timetable', () => {
  it('reads back what was written, without stop ids and with footpaths in stop order', () => {
    const back = decodeTimetable(encodeTimetable(tt));
    expect(back).toEqual({
      ...tt,
      stops: tt.stops.map((s) => ({ ...s, id: '' })),
      transfers: [
        { from: 0, to: 1, seconds: 1500 },
        { from: 0, to: 2, seconds: 60 },
        { from: 2, to: 0, seconds: 60 },
      ],
    });
  });

  it('rejects other and broken files', () => {
    expect(() => decodeTimetable(new Uint8Array([1, 2, 3, 4, 1]))).toThrow();
    const bin = encodeTimetable(tt);
    expect(() => decodeTimetable(bin.subarray(0, bin.length - 3))).toThrow();
  });
});
