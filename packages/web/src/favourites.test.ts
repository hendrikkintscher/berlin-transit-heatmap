import { describe, expect, it } from 'vitest';
import {
  coordsFromMapsUrl,
  csvRows,
  favouriteAt,
  parseImport,
  score,
  scoreGrid,
  type Favourite,
} from './favourites';

const fav = (label: string, weight: 1 | 2 | 3, lat = 52.5, lon = 13.4): Favourite => ({
  id: label,
  label,
  lat,
  lon,
  weight,
});

describe('score', () => {
  it('is the weighted average of trip minutes', () => {
    const times: Record<string, number> = { '52.5': 600, '52.6': 1800 };
    const s = score([fav('Work', 3, 52.5), fav('Bar', 1, 52.6)], (lat) => times[String(lat)]);
    expect(s.minutes).toEqual([10, 30]);
    expect(s.average).toBe(15); // (3*10 + 1*30) / 4
  });

  it('counts unreachable places as 120 minutes', () => {
    const s = score([fav('Far', 2)], () => Infinity);
    expect(s).toEqual({ minutes: [null], average: 120 });
  });

  it('has no score without places', () => {
    expect(score([], () => 0).average).toBeNull();
  });
});

describe('imports', () => {
  it('reads Takeout Saved Places GeoJSON, keeping places without a position for geocoding', () => {
    const json = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          geometry: { coordinates: [13.4127, 52.5219] },
          properties: { location: { name: 'Alexanderplatz', address: '10178 Berlin' } },
        },
        {
          geometry: { coordinates: [0, 0] },
          properties: { location: { name: 'Café X', address: 'Torstraße 1, Berlin' } },
        },
      ],
    });
    expect(parseImport(json)).toEqual([
      { label: 'Alexanderplatz', lat: 52.5219, lon: 13.4127, query: '10178 Berlin' },
      { label: 'Café X', query: 'Torstraße 1, Berlin' },
    ]);
  });

  it('reads Takeout list CSV with quoted fields', () => {
    const csv =
      'Title,Note,URL,Tags,Comment\r\n' +
      '"Bar ""Zur Linde""",,https://www.google.com/maps/place/Bar/data=!4m2!3m1!1s0x1:0x2,,\r\n' +
      'Dropped pin,,"https://www.google.com/maps/search/52.50123,13.41234",,\r\n';
    expect(parseImport(csv)).toEqual([
      { label: 'Bar "Zur Linde"', query: 'Bar "Zur Linde"' },
      { label: 'Dropped pin', lat: 52.50123, lon: 13.41234, query: 'Dropped pin' },
    ]);
  });

  it('reads its own export', () => {
    const own = JSON.stringify([fav('Work', 3)]);
    expect(parseImport(own)).toEqual([{ label: 'Work', lat: 52.5, lon: 13.4 }]);
  });

  it('finds positions in Google Maps links', () => {
    expect(coordsFromMapsUrl('https://maps.google.com/?q=52.52,13.40')).toEqual({
      lat: 52.52,
      lon: 13.4,
    });
    expect(coordsFromMapsUrl('https://www.google.com/maps/place/X/@52.5,13.4,17z')).toEqual({
      lat: 52.5,
      lon: 13.4,
    });
    expect(coordsFromMapsUrl('https://www.google.com/maps/place/X/data=!3d52.51!4d13.39')).toEqual({
      lat: 52.51,
      lon: 13.39,
    });
    expect(coordsFromMapsUrl('https://www.google.com/maps/place/X/data=!4m2')).toBeNull();
  });

  it('splits CSV with newlines inside quotes', () => {
    expect(csvRows('a,"b\nc"\nd,e')).toEqual([
      ['a', 'b\nc'],
      ['d', 'e'],
    ]);
  });

  it('shades the map by the weighted average, unreachable as 120 min', () => {
    const g = scoreGrid(
      [Float32Array.of(600, 600, Infinity), Float32Array.of(1200, Infinity, Infinity)],
      [3, 1],
    );
    expect([...g]).toEqual([750, 0.75 * 600 + 0.25 * 7200, 7200]);
  });
});

describe('favouriteAt', () => {
  it('finds a place a few metres off, not one a street away', () => {
    const list = [fav('Home', 2, 52.5, 13.4)];
    expect(favouriteAt(list, { lat: 52.50015, lon: 13.4 })?.label).toBe('Home');
    expect(favouriteAt(list, { lat: 52.5005, lon: 13.4 })).toBeUndefined();
  });
});
