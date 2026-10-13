import { describe, expect, it } from 'vitest';
import { earlyLoad, linkHasStart } from './early';

const NONE = { stepFree: null, travel: null };
// 2026-10-14 08:35 in Berlin (summer time).
const NOW = new Date('2026-10-14T06:35:00Z');

describe('early load', () => {
  it("takes the current hour's file, leaving, walking", () => {
    expect(earlyLoad('', NONE, NOW)).toEqual({
      window: '20261014-08',
      direction: 'depart',
      stepFree: false,
      bike: false,
    });
  });

  it('follows the link: its time, arriving (the hour before), step-free and bike', () => {
    expect(earlyLoad('?t=weekend-02&dir=arr&sf=1&go=bike', NONE, NOW)).toEqual({
      window: 'weekend-01',
      direction: 'arrive',
      stepFree: true,
      bike: true,
    });
  });

  it('uses the stored settings unless the link names them', () => {
    const stored = { stepFree: '1', travel: '1' };
    expect(earlyLoad('', stored, NOW)).toMatchObject({ stepFree: true, bike: true });
    expect(earlyLoad('?sf=0&go=walk', stored, NOW)).toMatchObject({ stepFree: false, bike: false });
    // Cycling only needs no bike timetable.
    expect(earlyLoad('', { stepFree: null, travel: '2' }, NOW)).toMatchObject({ bike: false });
  });
});

describe('linkHasStart', () => {
  it('is true only for a link with a start', () => {
    expect(linkHasStart('?from=52.52190,13.41320&m=typical')).toBe(true);
    expect(linkHasStart('')).toBe(false);
    expect(linkHasStart('?h=8&layers=freq')).toBe(false);
    expect(linkHasStart('?from=abc')).toBe(false);
  });
});
