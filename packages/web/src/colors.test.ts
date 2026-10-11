import { describe, expect, it } from 'vitest';
import {
  BAND_COLORS,
  BAND_EDGES_MIN,
  bandLabel,
  bandOf,
  colorLut,
  MAX_BAND,
  oklab,
} from './colors';

describe('colour bands', () => {
  it('has 5-min bands to 20, 2.5-min bands from 20 to 50, then wider ones up to 120+', () => {
    expect(BAND_COLORS).toHaveLength(BAND_EDGES_MIN.length);
    expect(bandLabel(0)).toBe('0–5');
    expect(bandLabel(4)).toBe('20–22.5');
    expect(bandLabel(MAX_BAND)).toBe('120+');
    const mid = BAND_EDGES_MIN.filter((m) => m >= 20 && m < 50);
    expect(mid).toHaveLength(12);
  });

  it('maps seconds to bands, clamping beyond 120 min', () => {
    expect(bandOf(0)).toBe(0);
    expect(bandOf(20 * 60 - 1)).toBe(3);
    expect(bandOf(20 * 60)).toBe(4);
    expect(bandOf(49 * 60)).toBe(15);
    expect(bandOf(10_000)).toBe(MAX_BAND);
    expect(bandOf(Infinity)).toBe(-1);
  });

  it('keeps neighbouring bands visibly distinct', () => {
    const lab = BAND_COLORS.map(oklab);
    for (let i = 1; i < lab.length; i++) {
      const d = Math.hypot(...lab[i].map((v, k) => v - lab[i - 1][k]));
      expect(d).toBeGreaterThan(0.05);
    }
  });

  it('builds an opaque per-second lookup table', () => {
    const lut = colorLut();
    expect(lut.length).toBe((120 * 60 + 1) * 4);
    expect(lut[3]).toBe(255);
    const c = BAND_COLORS[4];
    const k = 21 * 60 * 4;
    expect([lut[k], lut[k + 1], lut[k + 2]]).toEqual(
      [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)),
    );
  });
});
