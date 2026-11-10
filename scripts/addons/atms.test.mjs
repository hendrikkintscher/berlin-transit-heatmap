import { describe, expect, it } from 'vitest';
import { bankOf, buildAtms, pointOf, readSeq } from './atms.mjs';

const atm = (lon, lat, tags) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { amenity: 'atm', ...tags },
});

describe('Cash Group ATMs add-on', () => {
  it('finds the bank in operator, brand, network or name', () => {
    expect(bankOf({ operator: 'Commerzbank AG' })).toBe(0);
    expect(bankOf({ brand: 'Deutsche Bank' })).toBe(1);
    expect(bankOf({ operator: 'UniCredit Bank AG' })).toBe(2);
    expect(bankOf({ name: 'Postbank Finanzcenter' })).toBe(3);
    expect(bankOf({ operator: 'Deutsche Bundesbank' })).toBe(-1);
    expect(bankOf({ operator: 'Euronet', name: 'Geldautomat' })).toBe(-1);
    expect(bankOf({ operator: 'Euronet', name: 'Postbank' })).toBe(3);
  });

  it('takes a point, or the middle of a ring', () => {
    expect(pointOf({ type: 'Point', coordinates: [13.4, 52.5] })).toEqual([13.4, 52.5]);
    const ring = [
      [13, 52],
      [14, 52],
      [14, 53],
      [13, 53],
    ];
    expect(pointOf({ type: 'Polygon', coordinates: [ring] })).toEqual([13.5, 52.5]);
  });

  it('keeps the ATM’s own hours, never the bank’s', () => {
    const out = buildAtms([
      atm(13.41, 52.52, { operator: 'Postbank', opening_hours: '24/7' }),
      atm(13.3, 52.5, { operator: 'Euronet' }),
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [13.2, 52.4] },
        properties: {
          amenity: 'bank',
          atm: 'yes',
          name: 'Commerzbank',
          opening_hours: 'Mo-Fr 09:00-13:00',
        },
      },
    ]);
    expect(out.hours).toEqual(['24/7']);
    expect(out.p).toEqual([
      [13.2, 52.4, 0, -1],
      [13.41, 52.52, 3, 0],
    ]);
  });

  it('drops a bank’s atm=yes beside a mapped ATM of the same bank', () => {
    const bank = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.4002, 52.5001] },
      properties: { amenity: 'bank', atm: 'yes', brand: 'Deutsche Bank' },
    };
    const out = buildAtms([bank, atm(13.4, 52.5, { operator: 'Deutsche Bank' })]);
    expect(out.p).toEqual([[13.4, 52.5, 1, -1]]);
  });

  it('reads osmium’s GeoJSON text sequence', () => {
    const text = `\x1e${JSON.stringify(atm(13, 52, {}))}\n\x1e${JSON.stringify(atm(14, 53, {}))}\n`;
    expect(readSeq(text)).toHaveLength(2);
  });
});
