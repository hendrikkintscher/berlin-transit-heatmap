import { describe, expect, it } from 'vitest';
import {
  decodeStopList,
  decodeTimetable,
  encodeStopList,
  encodeTimetable,
  needsStopList,
  type TimetableData,
} from '../src';

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

  it('keeps dwells, and leaves them out where no trip waits', () => {
    const withDwells: TimetableData = {
      ...tt,
      routes: [
        {
          ...tt.routes[0]!,
          dwells: [
            [0, 30],
            [0, 45],
          ],
        },
        { ...tt.routes[1]!, dwells: [[0, 0, 0]] },
      ],
    };
    const back = decodeTimetable(encodeTimetable(withDwells));
    expect(back.routes[0]!.dwells).toEqual([
      [0, 30],
      [0, 45],
    ]);
    expect(back.routes[1]!.dwells).toBeUndefined();
  });

  it('rejects other and broken files', () => {
    expect(() => decodeTimetable(new Uint8Array([1, 2, 3, 4, 1]))).toThrow();
    const bin = encodeTimetable(tt);
    expect(() => decodeTimetable(bin.subarray(0, bin.length - 3))).toThrow();
  });
});

describe('stop list and hourly files', () => {
  const whole = decodeTimetable(encodeTimetable(tt));

  it('reads an hour back with its stop list as from a whole file', () => {
    const list = encodeStopList(tt);
    const hour = encodeTimetable(tt, list.id);
    expect(needsStopList(hour)).toBe(true);
    expect(needsStopList(encodeTimetable(tt))).toBe(false);
    const stops = decodeStopList(list.data);
    expect(stops.id).toBe(list.id);
    expect(stops.feedVersion).toBe('test');
    const back = decodeTimetable(hour, stops);
    expect(back).toEqual(whole);
    // Every hour shares the one list's stops and footpaths.
    const later = decodeTimetable(encodeTimetable({ ...tt, window: 'weekday-11' }, list.id), stops);
    expect(later.stops).toBe(back.stops);
    expect(later.transfers).toBe(back.transfers);
  });

  it('gives the same stops the same id, and other stops another', () => {
    // Only the stops and footpaths count, not the routes.
    const noRoutes = { feedVersion: tt.feedVersion, stops: tt.stops, transfers: tt.transfers };
    expect(encodeStopList(tt).id).toBe(encodeStopList(noRoutes).id);
    const moved = { ...tt, stops: [{ ...tt.stops[0]!, lat: 52.5 }, ...tt.stops.slice(1)] };
    expect(encodeStopList(moved).id).not.toBe(encodeStopList(tt).id);
    const longer = {
      ...tt,
      transfers: tt.transfers.map((t) => ({ ...t, seconds: t.seconds + 1 })),
    };
    expect(encodeStopList(longer).id).not.toBe(encodeStopList(tt).id);
  });

  it("refuses an hour without its stop list, or with another build's", () => {
    const hour = encodeTimetable(tt, encodeStopList(tt).id);
    expect(() => decodeTimetable(hour)).toThrow(/stop list/);
    const moved = { ...tt, stops: [{ ...tt.stops[0]!, lat: 52.5 }, ...tt.stops.slice(1)] };
    const other = decodeStopList(encodeStopList(moved).data);
    expect(() => decodeTimetable(hour, other)).toThrow(/different builds/);
  });

  it('rejects broken stop lists', () => {
    const { data } = encodeStopList(tt);
    expect(() => decodeStopList(data.subarray(0, data.length - 2))).toThrow();
    expect(() => decodeStopList(encodeTimetable(tt))).toThrow();
  });
});
