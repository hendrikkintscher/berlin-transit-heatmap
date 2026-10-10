import { describe, expect, it } from 'vitest';
import { BAND_COLORS, bandColor, bandLabel, MAX_BAND } from './colors';

describe('colour bands', () => {
  it('has one colour per band from 0–5 up to 90+', () => {
    expect(BAND_COLORS).toHaveLength(19);
    expect(bandLabel(0)).toBe('0–5');
    expect(bandLabel(MAX_BAND)).toBe('90+');
  });

  it('runs light to dark and clamps beyond 90 min', () => {
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(BAND_COLORS[0])).toBeGreaterThan(lum(BAND_COLORS[MAX_BAND]));
    expect(bandColor(40)).toBe(BAND_COLORS[MAX_BAND]);
  });
});
