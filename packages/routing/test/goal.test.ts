import { describe, expect, it } from 'vitest';
import { goalArrival, goalWindow, loadTimetable, reverseTimetable, travelTimes } from '../src';
import { A, B, C, D, G, I, miniTimetable, STOP_POS } from './fixture';

const H10 = 10 * 3600;
const raw = miniTimetable('day');
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, H10, H10 + 3600));
const profileTo = (dest: number, from = H10, span = 3000) =>
  travelTimes(back, STOP_POS[dest], {
    profile: { from: -(from + span), to: -from },
    arriveBy: -from,
  }).profile!;

describe('profile search (map to a destination, leaving at a set time)', () => {
  const p = profileTo(D);

  it('gives the arrival at the destination for leaving a stop at any moment, as forward routing does', () => {
    for (const stop of [A, B, C]) {
      for (let t = H10; t <= H10 + 1500; t += 47) {
        const forward = travelTimes(fwd, STOP_POS[stop], { leaveAt: t }).stopSeconds[D];
        expect(goalArrival(p, stop, t) - t).toBe(forward);
      }
    }
  });

  it('follows a footpath to another stop', () => {
    // G is a 3-minute footpath from C (and a walk of its own from the destination).
    for (let t = H10; t <= H10 + 1500; t += 61)
      expect(goalArrival(p, G, t)).toBeLessThanOrEqual(goalArrival(p, C, t + 180));
  });

  it('leaves a stop without service unreached', () => {
    expect(goalArrival(p, I, H10)).toBe(Infinity);
  });

  it('is Infinity once the last vehicle that gets there has gone', () => {
    expect(goalArrival(profileTo(D, H10, 600), A, H10 + 590)).toBe(Infinity);
  });
});

describe('goalWindow', () => {
  const p = profileTo(D);

  it('is the least waiting plus riding for arriving at the stop within the window', () => {
    // U1 A -> D takes 6 min and leaves every 10 min: standing there when it leaves, 6 min.
    expect(goalWindow(p, H10, H10 + 600, false)[A]).toBe(360);
    // Leaving just after one left: the next is 10 minutes less a second away, then the ride.
    expect(goalWindow(p, H10 + 1, H10 + 2, false)[A]).toBe(598 + 360);
  });

  it('averages the wait over leaving at any moment of the window', () => {
    // On average 5 min wait plus the 6-minute ride.
    expect(goalWindow(p, H10 + 600, H10 + 1800, true)[A] / 60).toBeCloseTo(11, 1);
  });

  it('leaves out stops nothing reaches', () => {
    expect(goalWindow(p, H10, H10 + 600, true)[I]).toBe(Infinity);
    expect(goalWindow(p, H10, H10 + 600, false)[G]).toBeLessThan(Infinity);
  });
});
