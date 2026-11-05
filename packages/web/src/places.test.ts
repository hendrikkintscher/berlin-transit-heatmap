import { describe, expect, it } from 'vitest';
import { labelPoint, pickPlaces, placeOf, placesCollection, type Place } from './places';

describe('places from the base map tiles', () => {
  it('takes lakes, bathing spots, parks and viewpoints with a name', () => {
    expect(placeOf('water_name', { class: 'lake', name: 'Schlachtensee' }, 13.2, 52.44)?.kind).toBe(
      'lake',
    );
    expect(
      placeOf(
        'poi',
        { class: 'swimming', subclass: 'swimming_area', name: 'Strandbad Wannsee' },
        13.18,
        52.43,
      )?.kind,
    ).toBe('bathe');
    expect(
      placeOf('poi', { class: 'attraction', name: 'Badestelle Alter Hof' }, 13.2, 52.4)?.kind,
    ).toBe('bathe');
    expect(
      placeOf(
        'poi',
        { class: 'attraction', subclass: 'viewpoint', name: 'Müggelturm' },
        13.64,
        52.41,
      )?.kind,
    ).toBe('view');
    expect(placeOf('park', { class: 'conservation', name: 'Grunewald' }, 13.25, 52.47)?.kind).toBe(
      'park',
    );
    expect(
      placeOf(
        'poi',
        { class: 'park', subclass: 'park', name: 'Kurpark Friedrichshagen' },
        13.62,
        52.45,
      )?.kind,
    ).toBe('park');
  });

  it('prefers the German name', () => {
    expect(
      placeOf('water_name', { class: 'lake', name: 'Lake', 'name:de': 'See' }, 13, 52)?.name,
    ).toBe('See');
  });

  it('leaves out what is not a place to go, or has no name', () => {
    expect(
      placeOf('poi', { class: 'swimming_pool', subclass: 'swimming_pool', name: 'Pool' }, 13, 52),
    ).toBeNull();
    expect(
      placeOf('poi', { class: 'swimming', subclass: 'swimming_pool', name: 'Hotelpool' }, 13, 52),
    ).toBeNull();
    expect(placeOf('poi', { class: 'attraction', name: 'Gedenkstein' }, 13, 52)).toBeNull();
    expect(placeOf('poi', { class: 'park', subclass: 'park' }, 13, 52)).toBeNull();
    expect(placeOf('water_name', { class: 'river', name: 'Spree' }, 13, 52)).toBeNull();
    expect(placeOf('park', { class: 'protected_area', name: 'Siedlung' }, 13, 52)).toBeNull();
    for (const name of [
      'LSG Lichterfelde-Süd',
      'Vogelschutzgebiet am Wildmeisterdamm',
      'Naturdenkmal Bumpfuhl',
    ])
      expect(placeOf('park', { class: 'conservation', name }, 13, 52)).toBeNull();
    expect(placeOf('water_name', { class: 'lake', name: 'X' }, NaN, 52)).toBeNull();
  });
});

describe('picking the places to show', () => {
  const p = (name: string, kind: Place['kind'], lat = 52.5): Place => ({
    name,
    kind,
    lat,
    lon: 13.4,
  });
  const secondsAt = (lat: number) => (lat > 52.9 ? Infinity : (lat - 52) * 10000);

  it('shows each place once, bathing first and the quickest first within a kind', () => {
    const out = pickPlaces(
      [
        p('Park A', 'park', 52.3),
        p('See B', 'lake', 52.4),
        p('See B', 'lake', 52.1),
        p('Bad C', 'bathe', 52.6),
        p('See D', 'lake', 52.2),
      ],
      secondsAt,
    );
    expect(out.map((x) => x.name)).toEqual(['Bad C', 'See D', 'See B', 'Park A']);
  });

  it('leaves out places off the map and keeps to the limit', () => {
    expect(pickPlaces([p('Far', 'lake', 53)], secondsAt)).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => p(`See ${i}`, 'lake', 52 + i / 100));
    expect(pickPlaces(many, secondsAt, 40)).toHaveLength(40);
  });

  it('labels each place with its name and minutes', () => {
    const fc = placesCollection([{ ...p('Schlachtensee', 'lake'), seconds: 1530 }], 'Min.');
    expect(fc.features[0]!.properties).toEqual({ label: 'Schlachtensee\n26 Min.', kind: 'lake' });
    expect(fc.features[0]!.geometry.coordinates).toEqual([13.4, 52.5]);
  });
});

describe('where a place sits', () => {
  it('takes a point, the middle of a lake label line, nothing for areas', () => {
    expect(labelPoint({ type: 'Point', coordinates: [13.2, 52.4] })).toEqual([13.2, 52.4]);
    expect(
      labelPoint({
        type: 'LineString',
        coordinates: [
          [13.1, 52.4],
          [13.2, 52.45],
          [13.3, 52.5],
        ],
      }),
    ).toEqual([13.2, 52.45]);
    expect(labelPoint({ type: 'Polygon', coordinates: [] })).toBeNull();
    const square = [
      [13, 52],
      [13.2, 52],
      [13.2, 52.2],
      [13, 52.2],
    ];
    const [x, y] = labelPoint({ type: 'Polygon', coordinates: [square] })!;
    expect([x, y].map((v) => v.toFixed(6))).toEqual(['13.100000', '52.100000']);
    expect(labelPoint({ type: 'MultiPolygon', coordinates: [[square]] })).toEqual([x, y]);
  });
});
