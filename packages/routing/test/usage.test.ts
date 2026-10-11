import { describe, expect, it } from 'vitest';
import {
  heatGrid,
  LEG_NONE,
  LEG_ORIGIN,
  LEG_WALK,
  loadTimetable,
  routeUsage,
  travelTimes,
  type PreparedTimetable,
  type TravelTimeResult,
} from '../src';
import { A, B, C, D, E, F, G, H, I, miniTimetable, randomTimetable, STOP_POS } from './fixture';

/** Stop the leg of `s` starts from (undefined for origin / unreachable). */
function parentOf(tt: PreparedTimetable, r: TravelTimeResult, s: number): number | undefined {
  const { kind, from } = r.legs!;
  if (kind[s] >= 0) return tt.routeStops[tt.routeStopOffset[kind[s]] + from[s]];
  if (kind[s] === LEG_WALK) return from[s];
  return undefined;
}

describe('travelTimes with trackLegs', () => {
  const tt = loadTimetable(miniTimetable('day'));
  const r = travelTimes(tt, STOP_POS[A], { trackLegs: true });
  const routeName = (s: number) => tt.routeNames[r.legs!.kind[s]];

  it('does not change travel times', () => {
    expect([...travelTimes(tt, STOP_POS[A]).stopSeconds]).toEqual([...r.stopSeconds]);
  });

  it('records the last leg of each fastest journey', () => {
    const { kind } = r.legs!;
    expect(kind[A]).toBe(LEG_ORIGIN);
    for (const s of [B, C, D]) {
      expect(routeName(s)).toBe('U1');
      expect(parentOf(tt, r, s)).toBe(A);
    }
    expect(routeName(E)).toBe('100');
    expect(parentOf(tt, r, F)).toBe(C);
    expect(kind[G]).toBe(LEG_WALK);
    expect(parentOf(tt, r, G)).toBe(C);
    expect(routeName(H)).toBe('M1');
    expect(kind[I]).toBe(LEG_NONE);
  });

  it('forms a tree back to the origin on random networks', () => {
    for (const seed of [1, 2, 3, 4]) {
      const raw = randomTimetable(seed);
      const t = loadTimetable(raw);
      const res = travelTimes(t, raw.stops[seed], { trackLegs: true });
      for (let s = 0; s < t.stopCount; s++) {
        let cur = s;
        for (let steps = 0; ; steps++) {
          expect(steps).toBeLessThan(t.stopCount);
          const p = parentOf(t, res, cur);
          if (p === undefined) break;
          expect(res.stopSeconds[p]).toBeLessThan(res.stopSeconds[cur]);
          cur = p;
        }
        const k = res.legs!.kind[cur];
        expect(k === LEG_ORIGIN || (k === LEG_NONE && res.stopSeconds[s] === Infinity)).toBe(true);
      }
    }
  });
});

describe('routeUsage', () => {
  const tt = loadTimetable(miniTimetable('day'));
  const r = travelTimes(tt, STOP_POS[A], { trackLegs: true });
  const grid = heatGrid(tt, r, { cellSizeM: 100, trackStops: true });
  const used = routeUsage(tt, r, grid, { minShare: 0 });
  const hop = (a: number, b: number) =>
    used.find((u) => u.a === Math.min(a, b) && u.b === Math.max(a, b));

  it('needs tracked legs and stops', () => {
    expect(() => routeUsage(tt, travelTimes(tt, STOP_POS[A]), grid)).toThrow();
  });

  it('weights hops by the map area reached over them', () => {
    const ab = hop(A, B)!;
    const bc = hop(B, C)!;
    const ce = hop(C, E)!;
    const ef = hop(E, F)!;
    expect(ab.names).toEqual(['U1']);
    expect(ab.mode).toBe('ubahn');
    expect(ce.mode).toBe('bus');
    // Everything east of B rides A-B, so it carries at least as much as B-C, and so on down the tree.
    expect(ab.cells).toBeGreaterThanOrEqual(bc.cells);
    expect(bc.cells).toBeGreaterThan(ce.cells);
    expect(ce.cells).toBeGreaterThan(ef.cells);
    expect(used[0].share).toBeLessThanOrEqual(1);
    expect(used.every((u, i) => i === 0 || used[i - 1].cells >= u.cells)).toBe(true);
    // Nothing rides the unserved stop.
    expect(used.some((u) => u.a === I || u.b === I)).toBe(false);
  });

  it('drops hops below minShare', () => {
    const big = routeUsage(tt, r, grid, { minShare: 0.5 });
    expect(big.length).toBeLessThan(used.length);
    expect(big.every((u) => u.share >= 0.5)).toBe(true);
  });

  it('records the stop each grid cell is reached from', () => {
    expect(grid.stop).toHaveLength(grid.seconds.length);
    let bad = 0;
    for (let k = 0; k < grid.seconds.length; k++) {
      if (grid.seconds[k] === Infinity && grid.stop![k] !== -1) bad++;
    }
    expect(bad).toBe(0);
  });
});
