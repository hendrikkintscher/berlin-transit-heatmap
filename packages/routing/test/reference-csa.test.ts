import { describe, expect, it } from 'vitest';
import { loadTimetable, travelTimes, walksToStops } from '../src';
import { earliestArrival } from '../bench/reference';
import { randomTimetable } from './fixture';

describe('the S040 reference search (Connection Scan)', () => {
  it('walks to the place only after a ride', () => {
    const tt = loadTimetable(randomTimetable(3));
    const at = { lat: tt.stops[0].lat, lon: tt.stops[0].lon };
    const access = walksToStops(tt, at);
    // The place is at the start's stop; with no direct walk it takes a ride there and back.
    const egress = new Float32Array(tt.stopCount).fill(Infinity);
    egress[0] = 0;
    const leave = tt.windowStart;
    const r = earliestArrival(tt, access, egress, leave);
    expect(r.arrive).toBeGreaterThan(leave);
    expect(r.arrive === Infinity || r.rides >= 1).toBe(true);
    // With the direct walk, that is the answer.
    expect(earliestArrival(tt, access, egress, leave, 0).arrive).toBe(leave);
  });

  it('agrees with RAPTOR at every stop of random networks', () => {
    let compared = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const tt = loadTimetable(randomTimetable(seed));
      const origin = { lat: tt.stops[0].lat, lon: tt.stops[0].lon };
      const leave = tt.windowStart + 600;
      const r = travelTimes(tt, origin, { leaveAt: leave });
      const access = walksToStops(tt, origin);
      const none = new Float32Array(tt.stopCount).fill(Infinity);
      const ref = earliestArrival(tt, access, none, leave);
      for (let s = 0; s < tt.stopCount; s++) {
        const raptor = leave + r.stopSeconds[s];
        if (!(raptor < Infinity) && !(ref.best[s] < Infinity)) continue;
        expect([seed, s, ref.best[s]]).toEqual([seed, s, raptor]);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
});
