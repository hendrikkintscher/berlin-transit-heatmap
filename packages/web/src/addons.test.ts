import { describe, expect, it } from 'vitest';
import { ATM_DOT_ZOOM, ATM_RADIUS, atmFeatures, type AtmFile } from './addons';

describe('ATM add-on file', () => {
  it('turns the compact file into points with their bank and hours', () => {
    const file: AtmFile = {
      v: 1,
      banks: ['Commerzbank', 'Postbank'],
      hours: ['24/7'],
      p: [
        [13.41, 52.52, 1, 0],
        [13.2, 52.4, 0, -1],
      ],
    };
    const f = atmFeatures(file).features;
    expect(f.map((x) => x.geometry.coordinates)).toEqual([
      [13.41, 52.52],
      [13.2, 52.4],
    ]);
    expect(f.map((x) => x.properties)).toEqual([
      { bank: 'Postbank', hours: '24/7' },
      { bank: 'Commerzbank', hours: '' },
    ]);
  });
});

describe('ATM dots by zoom (S059)', () => {
  it('show from zoom 10, small, and grow to the dot that carries the "€"', () => {
    expect(ATM_DOT_ZOOM).toBe(10);
    const stops = (ATM_RADIUS as unknown[]).slice(3) as number[];
    const zooms = stops.filter((_, i) => i % 2 === 0);
    const radii = stops.filter((_, i) => i % 2 === 1);
    expect(zooms[0]).toBe(ATM_DOT_ZOOM);
    expect(radii[0]).toBeLessThanOrEqual(2);
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
    expect(radii[zooms.indexOf(14)]).toBe(6);
  });
});
