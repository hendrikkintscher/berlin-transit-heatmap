import { describe, expect, it } from 'vitest';
import { FILL_OUTLINE_WIDTH } from './map-layers';

describe('time lines over the colour fill', () => {
  it('are thin, 15 min boldest, then 30, 45 and the hairlines (S013)', () => {
    // ['interpolate', ['linear'], ['zoom'], 9, widths at 9, 14, widths at 14]
    const stops = FILL_OUTLINE_WIDTH as unknown as unknown[];
    for (const m of [stops[4], stops[6]] as (string | number)[][]) {
      const w = [m[3], m[5], m[7], m[8]] as number[];
      expect([...w].sort((a, b) => b - a)).toEqual(w);
      // At most 2.1 px even at street zoom: the fill carries the minutes.
      expect(Math.max(...w)).toBeLessThanOrEqual(2.1);
    }
  });
});
