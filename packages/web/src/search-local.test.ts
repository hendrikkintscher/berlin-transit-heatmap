import { describe, expect, it } from 'vitest';
import { fold, localMatches, matchScore, withoutLocal, type LocalPlace } from './search-local';

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
