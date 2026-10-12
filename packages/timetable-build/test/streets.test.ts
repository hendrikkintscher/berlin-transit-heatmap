import { describe, expect, it } from 'vitest';
import { addTowns, buildStreets, encodeStreets, townParts, type Street } from '../src/streets.ts';

// Two pieces of one Teststraße 300 m apart, another Teststraße 20 km away, a named footway
// and an unnamed street.
const opl = [
  'n1 x13.40 y52.50',
  'n2 x13.401 y52.50',
  'n3 x13.404 y52.50',
  'n4 x13.405 y52.50',
  'n5 x13.70 y52.60',
  'n6 x13.701 y52.60',
  'w1 Thighway=residential,name=Teststra%df%e,postal_code=10115 Nn1,n2',
  'w2 Thighway=tertiary,name=Teststra%df%e,postal_code=10115 Nn3,n4',
  'w3 Thighway=residential,name=Teststra%df%e Nn5,n6',
  'w4 Thighway=footway,name=Uferweg Nn1,n3',
  'w5 Thighway=residential Nn2,n3',
];

describe('buildStreets', () => {
  it('groups ways of one name that lie close together', async () => {
    const streets = await buildStreets(opl, [13, 52, 14, 53]);
    expect(streets.map((s) => [s.name, s.postcode])).toEqual([
      ['Teststraße', '10115'],
      ['Teststraße', ''],
    ]);
    expect(streets[0]!.lat).toBeCloseTo(52.5);
  });

  it('writes one line per name', async () => {
    const streets = await buildStreets(opl, [13, 52, 14, 53]);
    streets[1]!.town = 'Dorf';
    const file = encodeStreets(streets, [13, 52, 14, 53]);
    const [name, points] = file.streets.split('\t');
    expect(name).toBe('Teststraße');
    expect(points!.split(';').map((p) => p.split('|').slice(0, 2))).toEqual([
      ['10115', ''],
      ['', 'Dorf'],
    ]);
  });
});

describe('towns', () => {
  it('reads town candidates from stop names', () => {
    expect(townParts('Preysingstr./Malteserstr. (Berlin)')).toEqual(['Berlin']);
    expect(townParts('Wustermark, Hafenstr. 10/Hafen')).toEqual([
      'Wustermark',
      'Hafenstr. 10/Hafen',
    ]);
    expect(townParts('Alexanderplatz')).toEqual([]);
  });

  it('takes the town the stops around a street share', () => {
    const streets: Street[] = [{ name: 'Dorfstraße', postcode: '', lat: 52.6, lon: 13.7 }];
    addTowns(streets, [
      { name: 'Wustermark, Hafenstr.', lat: 52.601, lon: 13.7 },
      { name: 'Bahnhof, Wustermark', lat: 52.602, lon: 13.7 },
      { name: 'Elstal, Kirche', lat: 52.603, lon: 13.7 },
    ]);
    expect(streets[0]!.town).toBe('Wustermark');
  });
});
