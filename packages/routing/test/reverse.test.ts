import { describe, expect, it } from 'vitest';
import { loadTimetable, reverseTimetable, travelTimes } from '../src';
import { A, B, D, I, miniTimetable, randomTimetable, STOP_POS } from './fixture';
import { referenceTravelTimes } from './reference';

const H10 = 10 * 3600;

describe('reverseTimetable (arrive by)', () => {
  const raw = miniTimetable('day');
  const back = loadTimetable(reverseTimetable(raw, H10 + 1800, H10 + 2400));
  const toD = travelTimes(back, STOP_POS[D], { typical: true });

  it('gives the shortest journey to the destination', () => {
    // U1 A -> D is three 2-minute hops.
    expect(toD.stopSeconds[A]).toBe(360);
    expect(toD.stopSeconds[B]).toBe(240);
    expect(toD.stopSeconds[D]).toBe(0);
    expect(toD.stopSeconds[I]).toBe(Infinity);
  });

  it('averages the slack of arriving at a random moment of the window', () => {
    // A train every 10 min: on average 5 min early, plus the 6-minute ride.
    expect(toD.typicalSeconds![A] / 60).toBeCloseTo(11, 1);
  });

  it('round-trips back to the original timetable', () => {
    const t = randomTimetable(3);
    const twice = reverseTimetable(reverseTimetable(t, 0, 1), -t.windowEnd, -t.windowStart);
    expect(twice.windowStart).toBe(t.windowStart);
    expect(twice.windowEnd).toBe(t.windowEnd);
    expect(twice.transfers).toEqual(t.transfers);
    for (let r = 0; r < t.routes.length; r++) {
      expect(twice.routes[r].stops).toEqual(t.routes[r].stops);
      expect([...twice.routes[r].trips].sort((a, b) => a[0] - b[0])).toEqual(
        [...t.routes[r].trips].sort((a, b) => a[0] - b[0]),
      );
    }
  });

  it('agrees with forward routing between two stops', () => {
    // Forward from A leaving 10:00–10:30 reaches D in 6 min; backwards, arriving 10:06–10:36, also 6 min.
    const fwd = referenceTravelTimes(
      { ...raw, windowStart: H10, windowEnd: H10 + 1800 },
      STOP_POS[A],
    );
    const bwd = travelTimes(
      loadTimetable(reverseTimetable(raw, H10 + 360, H10 + 2160)),
      STOP_POS[D],
    );
    expect(bwd.stopSeconds[A]).toBe(fwd[D]);
  });
});
