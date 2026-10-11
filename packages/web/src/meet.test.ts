import { describe, expect, it } from 'vitest';
import { suggestMeetingPoints } from './meet';

const at = (name: string, kmEast: number) => ({
  name,
  lat: 52.5,
  lon: 13.4 + kmEast / (111.32 * Math.cos((52.5 * Math.PI) / 180)),
});

describe('suggestMeetingPoints', () => {
  it('picks the smallest slower-of-both time, then the smallest sum', () => {
    const c = [at('A', 0), at('B', 5), at('C', 10)];
    const t: [number, number][] = [
      [600, 1200], // max 20
      [900, 900], // max 15, sum 30
      [600, 900], // max 15, sum 25
    ];
    expect(suggestMeetingPoints(c, (i) => t[i]).map((s) => s.name)).toEqual(['C', 'B', 'A']);
  });

  it('spreads suggestions out and skips unreachable places', () => {
    const c = [at('A', 0), at('A2', 0.5), at('B', 3), at('X', 6)];
    const t: [number, number][] = [
      [600, 600],
      [600, 660],
      [900, 900],
      [300, Infinity],
    ];
    const s = suggestMeetingPoints(c, (i) => t[i]);
    expect(s.map((x) => x.name)).toEqual(['A', 'B']);
    expect(s[0]).toMatchObject({ a: 10, b: 10 });
  });
});
