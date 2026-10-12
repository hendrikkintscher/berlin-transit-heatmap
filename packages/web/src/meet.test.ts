import { describe, expect, it } from 'vitest';
import { suggestMeetingPoints } from './meet';

const at = (name: string, kmEast: number) => ({
  name,
  lat: 52.5,
  lon: 13.4 + kmEast / (111.32 * Math.cos((52.5 * Math.PI) / 180)),
});

describe('suggestMeetingPoints', () => {
  it('ranks by slowest + average trip', () => {
    const c = [at('A', 0), at('B', 5), at('C', 10)];
    const t: number[][] = [
      [600, 1200], // max 20
      [900, 900], // max 15, sum 30
      [600, 900], // max 15, sum 25
    ];
    expect(suggestMeetingPoints(c, (i) => t[i]).map((s) => s.name)).toEqual(['C', 'B', 'A']);
  });

  it('spreads suggestions out and skips unreachable places', () => {
    const c = [at('A', 0), at('A2', 0.5), at('B', 3), at('X', 6)];
    const t: number[][] = [
      [600, 600],
      [600, 660],
      [900, 900],
      [300, Infinity],
    ];
    const s = suggestMeetingPoints(c, (i) => t[i]);
    expect(s.map((x) => x.name)).toEqual(['A', 'B']);
    expect(s[0]).toMatchObject({ mins: [10, 10] });
  });

  it('does not send one person far so the other walks', () => {
    const c = [at('Spandau', 0), at('Savignyplatz', 5)];
    const t = [
      [4 * 60, 46 * 60], // 46 + 25 = 71
      [29 * 60, 29 * 60], // 29 + 29 = 58
    ];
    expect(suggestMeetingPoints(c, (i) => t[i])[0].name).toBe('Savignyplatz');
  });

  it('gives the slowest a minute when the group saves a lot', () => {
    const c = [at('Hermannstr', 0), at('Friedrichstr', 5)];
    const t = [
      [39 * 60, 39 * 60, 31 * 60], // 39 + 36.3
      [40 * 60, 38 * 60, 12 * 60], // 40 + 30
    ];
    expect(suggestMeetingPoints(c, (i) => t[i])[0].name).toBe('Friedrichstr');
  });

  it('weighs everyone with three or more starts', () => {
    const c = [at('A', 0), at('B', 5)];
    const t = [
      [300, 300, 1500], // max 25
      [900, 900, 900], // max 15
    ];
    expect(suggestMeetingPoints(c, (i) => t[i]).map((s) => s.name)).toEqual(['B', 'A']);
  });
});
