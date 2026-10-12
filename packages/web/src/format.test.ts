import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  eveningClock,
  googleDirections,
  gridSeconds,
  shortStop,
  stopName,
  whenText,
} from './format';
import { leaveOffset } from './when';

describe('format', () => {
  it('shortens VBB stop names', () => {
    expect(stopName('U Hermannplatz (Berlin)')).toBe('U Hermannplatz');
    expect(stopName('Berlin, Greifswalder Str.')).toBe('Greifswalder Str.');
    expect(shortStop('S+U Alexanderplatz Bhf (Berlin)')).toBe('Alexanderplatz');
  });

  it('escapes HTML', () => {
    expect(escapeHtml(`<b a="1">&'`)).toBe('&#60;b a=&#34;1&#34;&#62;&#38;&#39;');
  });

  it('names the time for the card', () => {
    expect(whenText({ day: 'weekday', hour: 10 }, 'depart')).toBe('werktags ab 10 Uhr');
    expect(whenText({ day: 'weekday', hour: 23 }, 'arrive')).toBe(
      'werktags, Ankunft 23 Uhr bis 0 Uhr',
    );
  });

  it('links Google Maps directions', () => {
    const a = { lat: 52.5, lon: 13.4 };
    const b = { lat: 52.45, lon: 13.5 };
    expect(googleDirections(a, b)).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=52.50000,13.40000&destination=52.45000,13.50000&travelmode=transit',
    );
    expect(googleDirections(a, b, true)).toContain('travelmode=bicycling');
  });

  it('reads a raster cell, Infinity outside', () => {
    const r = {
      image: { width: 1, height: 1, rgba: new Uint8ClampedArray(4) },
      bbox: [13, 52, 14, 53] as [number, number, number, number],
      grid: { cols: 2, rows: 2, seconds: new Float32Array([1, 2, 3, 4]) },
    };
    expect(gridSeconds(r, 52.9, 13.1)).toBe(1);
    expect(gridSeconds(r, 52.1, 13.9)).toBe(4);
    expect(gridSeconds(r, 51.9, 13.5)).toBe(Infinity);
  });

  it('leaves "now" only in the current hour', () => {
    // 2026-10-13 is a Tuesday; 08:25:30 UTC is 10:25:30 in Berlin.
    const now = new Date('2026-10-13T08:25:30Z');
    expect(leaveOffset({ day: 'weekday', hour: 10 }, now)).toBe(25 * 60 + 30);
    expect(leaveOffset({ day: 'weekday', hour: 11 }, now)).toBe(0);
    expect(leaveOffset({ day: 'weekend', hour: 10 }, now)).toBe(0);
  });

  it('reads evening seconds past midnight as a clock time', () => {
    expect(eveningClock(25 * 3600 + 5 * 60)).toBe('01:05 Uhr');
    expect(eveningClock(23 * 3600 + 59 * 60 + 30)).toBe('23:59 Uhr');
  });
});
