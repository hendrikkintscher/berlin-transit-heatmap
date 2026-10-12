import { describe, expect, it } from 'vitest';
import {
  fold,
  localMatches,
  matchScore,
  parseStreets,
  streetMatches,
  withoutLocal,
  withRemoteDetail,
  type LocalPlace,
} from './search-local';

const st = (label: string, weight = 0): LocalPlace => ({
  label,
  detail: '',
  lat: 52.5,
  lon: 13.4,
  kind: 'station',
  weight,
});

describe('fold', () => {
  it('ignores case, accents, ß and Straße/Str.', () => {
    expect(fold('Müllerstraße')).toBe('mullerstr');
    expect(fold('Müllerstr.')).toBe('mullerstr');
    expect(fold('Große Hamburger')).toBe('grosse hamburger');
  });
});

describe('matchScore', () => {
  it('prefers names that start with the query, also behind S+U', () => {
    expect(matchScore('Alexanderplatz', 'alex')).toBe(2);
    expect(matchScore('S+U Alexanderplatz', 'alex')).toBe(2);
    expect(matchScore('U Rosa-Luxemburg-Platz', 'luxem')).toBe(1);
    expect(matchScore('Hermannplatz', 'alex')).toBe(0);
  });
});

describe('localMatches', () => {
  const pool = [
    st('Alexanderstr.', 10),
    st('S+U Alexanderplatz', 200),
    { ...st('Alexanderplatz'), kind: 'recent' as const },
    { ...st('Alexa Shopping'), kind: 'favourite' as const },
  ];

  it('lists recent, favourites, then busy stations, without duplicates', () => {
    expect(localMatches('alex', pool).map((p) => p.label)).toEqual([
      'Alexanderplatz',
      'Alexa Shopping',
      // S+U Alexanderplatz is the recent search's place: listed once.
      'Alexanderstr.',
    ]);
  });

  it('shows recent searches for an empty query', () => {
    expect(localMatches('', pool).map((p) => p.kind)).toEqual(['recent']);
  });
});

describe('localMatches, one row per place', () => {
  it('keeps the busiest of the stops sharing a name nearby', () => {
    const pool = [
      st('S+U Alexanderplatz Bhf', 300),
      st('S+U Alexanderplatz Bhf/Gontardstr.', 60),
      st('U Alexanderplatz', 40),
      { ...st('Alexanderplatz', 5), lat: 52.6 },
    ];
    expect(localMatches('alex', pool).map((p) => p.label)).toEqual([
      'S+U Alexanderplatz Bhf',
      'Alexanderplatz',
    ]);
  });
});

describe('withoutLocal', () => {
  it('drops remote results already listed nearby', () => {
    const local = [st('Alexanderplatz')];
    const remote = [
      { label: 'alexanderplatz', detail: '', lat: 52.501, lon: 13.401 },
      { label: 'Alexanderplatz', detail: 'far', lat: 52.4, lon: 13.4 },
    ];
    expect(withoutLocal(remote, local).map((p) => p.detail)).toEqual(['far']);
  });
});

describe('the street list', () => {
  // Box corner 13.0, 52.3; points in 1e-4 degrees, base 36.
  const at = (lat: number, lon: number) =>
    `${Math.round((lat - 52.3) * 1e4).toString(36)},${Math.round((lon - 13) * 1e4).toString(36)}`;
  const streets = parseStreets({
    box: [13, 52.3, 14, 52.8],
    streets: [
      `Hauptstraße\t10827|Berlin|${at(52.48, 13.35)};14482|Potsdam|${at(52.4, 13.1)};|Seddin|${at(52.31, 13.01)}`,
      `Karl-Marx-Straße\t12043|Berlin|${at(52.476, 13.439)}`,
      `Torstraße\t10119|Berlin|${at(52.5296, 13.4017)}`,
    ].join('\n'),
  });

  it('reads each place of a name as its own street', () => {
    expect(streets).toHaveLength(5);
    expect(streets[2]).toMatchObject({
      kind: 'street',
      label: 'Hauptstraße',
      detail: 'Seddin',
      lat: 52.31,
      lon: 13.01,
      street: { name: 'Hauptstraße' },
    });
    expect(streets[0]?.street).toEqual({ name: 'Hauptstraße', postcode: '10827' });
  });

  it('finds streets by abbreviation, nearest to the map first', () => {
    const near = { lat: 52.5, lon: 13.4 };
    expect(streetMatches('Karl-Marx-Str', streets, near).map((s) => s.detail)).toEqual([
      '12043 Berlin',
    ]);
    expect(streetMatches('hauptstr', streets, near).map((s) => s.detail)).toEqual([
      '10827 Berlin',
      '14482 Potsdam',
      'Seddin',
    ]);
    expect(streetMatches('Hauptstraße Potsdam', streets, near).map((s) => s.detail)).toEqual([
      '14482 Potsdam',
    ]);
    expect(streetMatches('Torstr 5', streets, near)).toEqual([]);
  });

  it("drops Photon's copy of a listed street and takes its wording", () => {
    const torstr = streets.find((s) => s.label === 'Torstraße')!;
    const remote = [
      { ...torstr, detail: '10119 Mitte', street: { name: 'Torstraße', postcode: '10119' } },
      {
        label: 'Torstraße',
        detail: '10115 Mitte',
        lat: 52.3,
        lon: 13.9,
        street: { name: 'Torstraße' },
      },
    ];
    expect(withoutLocal(remote, [torstr]).map((p) => p.detail)).toEqual(['10115 Mitte']);
    expect(withRemoteDetail([torstr], remote)[0]?.detail).toBe('10119 Mitte');
  });
});
