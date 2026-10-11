import { describe, expect, it } from 'vitest';
import { toPlaces } from './search';

const f = (properties: Record<string, string>, lon = 13.4, lat = 52.5) => ({
  properties,
  geometry: { coordinates: [lon, lat] as [number, number] },
});

describe('toPlaces', () => {
  it('labels addresses by street and house number', () => {
    const [p] = toPlaces([
      f({
        street: 'Torstraße',
        housenumber: '1',
        postcode: '10119',
        district: 'Mitte',
        city: 'Berlin',
      }),
    ]);
    expect(p).toEqual({ label: 'Torstraße 1', detail: '10119 Mitte', lat: 52.5, lon: 13.4 });
  });

  it('labels named places and shows their address underneath', () => {
    const [p] = toPlaces([
      f({
        name: 'Alexanderplatz',
        street: 'Dircksenstraße',
        housenumber: '2',
        postcode: '10179',
        district: 'Mitte',
        city: 'Berlin',
      }),
    ]);
    expect(p.label).toBe('Alexanderplatz');
    expect(p.detail).toBe('Dircksenstraße 2, 10179 Mitte');
  });

  it('names the town outside Berlin and drops duplicates and blanks', () => {
    const places = toPlaces([
      f({ name: 'Bahnhof', city: 'Potsdam' }),
      f({ name: 'Bahnhof', city: 'Potsdam' }),
      f({ city: 'Berlin' }),
    ]);
    expect(places).toEqual([{ label: 'Bahnhof', detail: 'Potsdam', lat: 52.5, lon: 13.4 }]);
  });

  it('puts the plain address first when the query has a house number', () => {
    const at = { street: 'Torstraße', housenumber: '1', postcode: '10119', district: 'Mitte' };
    const places = toPlaces(
      [f({ ...at, name: 'Soho House' }), f(at), f({ name: 'Torstraße', postcode: '10119' })],
      'Torstr 1',
    );
    expect(places.map((p) => p.label)).toEqual(['Torstraße 1', 'Torstraße']);
  });
});
