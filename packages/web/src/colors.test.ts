import { describe, expect, it } from 'vitest';
import {
  HOME_COLORS,
  HOME_TICKS,
  homeBandOf,
  homeLut,
  BAND_COLORS,
  BAND_EDGES_MIN,
  bandLabel,
  bandOf,
  colorLut,
  DIFF_COLORS,
  DIFF_EDGES_MIN,
  DIFF_MAX_S,
  DIFF_MIN_S,
  diffBandOf,
  diffLut,
  MAX_BAND,
  oklab,
  OUTLINE_BEYOND_COLOR,
  OUTLINE_STEP_COLORS,
  OUTLINE_STEP_MINUTES,
  outlineBandColor,
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

describe('feathered lookup table', () => {
  const hard = colorLut();
  const soft = colorLut(45);
  const rgbAt = (lut: Uint8Array, s: number) => [lut[s * 4], lut[s * 4 + 1], lut[s * 4 + 2]];

  it('matches the hard table in the middle of a band', () => {
    expect(rgbAt(soft, 7.5 * 60)).toEqual(rgbAt(hard, 7.5 * 60));
  });

  it('meets halfway at a band edge and changes gradually', () => {
    const edge = 30 * 60;
    const below = rgbAt(hard, edge - 1);
    const above = rgbAt(hard, edge);
    const mid = rgbAt(soft, edge);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(mid[i] - (below[i] + above[i]) / 2)).toBeLessThanOrEqual(3);
    }
    for (let s = edge - 60; s < edge + 60; s++) {
      const a = rgbAt(soft, s);
      const b = rgbAt(soft, s + 1);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(6);
    }
  });
});

describe('difference colours', () => {
  it('puts small differences in the neutral band and grows both ways', () => {
    expect(DIFF_COLORS).toHaveLength(DIFF_EDGES_MIN.length);
    expect(diffBandOf(0)).toBe(4);
    expect(diffBandOf(-90)).toBe(4);
    expect(diffBandOf(150)).toBe(5);
    expect(diffBandOf(-25 * 60)).toBe(0);
    expect(diffBandOf(45 * 60)).toBe(DIFF_COLORS.length - 1);
  });

  it('builds a lookup over the clamped range', () => {
    const lut = diffLut();
    expect(lut.length).toBe((DIFF_MAX_S - DIFF_MIN_S + 1) * 4);
    expect(lut[(0 - DIFF_MIN_S) * 4 + 3]).toBe(255);
  });

  it('bands the home map by the clock, all night first', () => {
    expect(homeBandOf(0)).toBe(0); // leaving at 4 Uhr
    expect(homeBandOf(119 * 60)).toBe(0); // 2:01
    expect(homeBandOf(3 * 3600)).toBe(2); // 1 Uhr
    expect(homeBandOf(10 * 3600)).toBe(HOME_COLORS.length - 1); // 18 Uhr
    expect(HOME_TICKS).toHaveLength(HOME_COLORS.length - 1);
    expect(homeLut()[3]).toBe(255);
  });
});

describe('single-hue outlines', () => {
  it('has one colour per 10-minute step, darkest first', () => {
    expect(OUTLINE_STEP_MINUTES).toEqual([10, 20, 30, 40, 50, 60]);
    expect(OUTLINE_STEP_COLORS).toHaveLength(OUTLINE_STEP_MINUTES.length);
    const light = OUTLINE_STEP_COLORS.map((c) => oklab(c)[0]);
    for (let i = 1; i < light.length; i++) expect(light[i]).toBeGreaterThan(light[i - 1]);
  });

  it('colours each legend band by the outline it lies inside', () => {
    expect(outlineBandColor(bandOf(4 * 60))).toBe(OUTLINE_STEP_COLORS[0]);
    expect(outlineBandColor(bandOf(9 * 60))).toBe(OUTLINE_STEP_COLORS[0]);
    expect(outlineBandColor(bandOf(23 * 60))).toBe(OUTLINE_STEP_COLORS[2]);
    expect(outlineBandColor(bandOf(58 * 60))).toBe(OUTLINE_STEP_COLORS[5]);
    expect(outlineBandColor(bandOf(80 * 60))).toBe(OUTLINE_BEYOND_COLOR);
    expect(outlineBandColor(MAX_BAND)).toBe(OUTLINE_BEYOND_COLOR);
  });
});
