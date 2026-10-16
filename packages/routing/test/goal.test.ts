import { describe, expect, it } from 'vitest';
import {
  goalArrival,
  goalCells,
  goalUsage,
  goalWindow,
  heatGrid,
  LEG_WALK,
  loadTimetable,
  reverseTimetable,
  travelTimes,
} from '../src';
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

describe('lines of a map to a destination (goalUsage)', () => {
  const found = travelTimes(back, STOP_POS[D], {
    profile: { from: -(H10 + 3000), to: -H10 },
    arriveBy: -H10,
    trackLegs: true,
  });
  const p = found.profile!;
  const stopSeconds = goalWindow(p, H10, H10 + 600, false);
  const grid = heatGrid(back, { ...found, stopSeconds }, { cellSizeM: 100, trackStops: true });
  const cells = new Float64Array(p.departure.length);
  goalCells(grid, stopSeconds, p, H10, undefined, cells);
  const used = goalUsage(back, p, cells, grid, { minShare: 0 });
  const hop = (a: number, b: number) =>
    used.find((u) => u.a === Math.min(a, b) && u.b === Math.max(a, b));

  it('records legs without changing the profile', () => {
    const plain = profileTo(D);
    expect([...p.arrival]).toEqual([...plain.arrival]);
    expect([...p.departure]).toEqual([...plain.departure]);
  });

  it("gives each leg's stop before it an event of the same departure", () => {
    const { kind, from } = p.legs!;
    for (let s = 0; s < p.offset.length - 1; s++)
      for (let i = p.offset[s]; i < p.offset[s + 1]; i++) {
        const k = kind[i];
        if (k < LEG_WALK) continue;
        const before = k >= 0 ? back.routeStops[back.routeStopOffset[k] + from[i]] : from[i];
        let same = false;
        for (let j = p.offset[before]; j < p.offset[before + 1]; j++)
          if (p.departure[j] === p.departure[i]) same = true;
        expect(same).toBe(true);
      }
  });

  it('counts every cell that takes an event', () => {
    let taken = 0;
    for (let k = 0; k < grid.seconds.length; k++)
      if (grid.stop![k] >= 0 && grid.seconds[k] < Infinity) taken++;
    expect(cells.reduce((a, b) => a + b, 0)).toBe(taken);
  });

  it('rides the line the cells take to the destination', () => {
    // Every cell around A takes the U1 through B and C to D.
    const ab = hop(A, B)!;
    expect(ab.names).toEqual(['U1']);
    expect(hop(B, C)!.cells).toBeGreaterThanOrEqual(ab.cells);
    expect(hop(C, D)!.cells).toBeGreaterThanOrEqual(hop(B, C)!.cells);
  });

  it('needs a profile with legs', () => {
    expect(() => goalUsage(back, profileTo(D), cells, grid)).toThrow();
  });
});
