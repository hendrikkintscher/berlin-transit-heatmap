import { describe, expect, it } from 'vitest';
import { atmFeatures, type AtmFile } from './addons';

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
