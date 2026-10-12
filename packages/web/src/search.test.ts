import { describe, expect, it } from 'vitest';
import { streetHouses, toPlaces } from './search';

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

describe('covered area', () => {
  it('drops places outside the heatmap area', () => {
    const list = toPlaces([
      f({ name: 'Alexanderplatz', city: 'Berlin' }, 13.413, 52.522),
      f({ name: 'Potsdam Hauptbahnhof', city: 'Potsdam' }, 13.067, 52.391),
      f({ name: 'Bernau Bahnhof', city: 'Bernau' }, 13.588, 52.676),
      f({ name: 'Oranienburg', city: 'Oranienburg' }, 13.237, 52.753),
      f({ name: 'Brandenburg an der Havel', city: 'Brandenburg' }, 12.556, 52.411),
      f({ name: 'Fürstenwalde', city: 'Fürstenwalde' }, 14.067, 52.36),
    ]);
    expect(list.map((p) => p.label)).toEqual([
      'Alexanderplatz',
      'Potsdam Hauptbahnhof',
      'Bernau Bahnhof',
      'Oranienburg',
    ]);
  });
});

describe('staged address search', () => {
  const street = { type: 'street', osm_key: 'highway', district: 'Mitte', city: 'Berlin' };
  it('marks streets, one row per postcode', () => {
    const list = toPlaces(
      [
        f({ ...street, name: 'Torstraße', postcode: '10119' }),
        f({ ...street, name: 'Torstraße', postcode: '10119' }),
        f({ ...street, name: 'Torstraße', postcode: '10115' }),
      ],
      'torstr',
    );
    expect(list.map((p) => [p.detail, p.street])).toEqual([
      ['10119 Mitte', { name: 'Torstraße', postcode: '10119' }],
      ['10115 Mitte', { name: 'Torstraße', postcode: '10115' }],
    ]);
  });
  it("keeps the picked street's houses in its postcode, without shops", () => {
    const at = { street: 'Torstraße', housenumber: '12', district: 'Mitte' };
    const list = toPlaces(
      [
        f({ ...at, postcode: '10119' }),
        f({ ...at, postcode: '14542', district: 'Werder (Havel)' }),
        f({ ...at, postcode: '10119', name: 'Café' }),
      ],
      'Torstraße 12, 10119',
    );
    expect(streetHouses(list, { name: 'Torstraße', postcode: '10119' })).toEqual([
      { label: 'Torstraße 12', detail: '10119 Mitte', lat: 52.5, lon: 13.4 },
    ]);
  });
  it('does not take a postcode for a house number', () => {
    const list = toPlaces(
      [
        f({ name: 'Bäckerei', street: 'Hauptstraße', housenumber: '3', postcode: '10317' }),
        f({ ...street, name: 'Hauptstraße', postcode: '10317' }),
      ],
      'Hauptstraße 10317',
    );
    expect(list[0]?.label).toBe('Bäckerei');
  });
});

describe('streetHouses without a postcode', () => {
  it('keeps the houses near the picked street', () => {
    const house = (lat: number) => ({ label: 'Hauptstraße 5', detail: '', lat, lon: 13.1 });
    expect(
      streetHouses([house(52.4), house(52.6)], { name: 'Hauptstraße' }, { lat: 52.401, lon: 13.1 }),
    ).toEqual([house(52.4)]);
  });
});
