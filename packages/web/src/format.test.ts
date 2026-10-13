import { describe, expect, it, vi } from 'vitest';
import {
  dateLabel,
  dayLabel,
  escapeHtml,
  eveningClock,
  gridSeconds,
  pillText,
  shortStop,
  whenChipText,
  whenText,
} from './format';
import { leaveOffset, upcomingDays } from './when';
import { stopName } from './stop-name';
import { setLang } from './i18n';

describe('format', () => {
  it('keeps the Zeit chip short: no "Uhr" after a clock time, the measure as one mark', () => {
    // The longest: a date, arriving, an exact minute and Typisch (about 190 px; Mehr stays
    // on screen beside the scrolling chips whatever their width).
    const day = upcomingDays()[3]!;
    // setLang rewrites the page's texts: an empty page will do.
    vi.stubGlobal('document', {
      documentElement: {},
      querySelector: () => null,
      querySelectorAll: () => [],
    });
    try {
      for (const l of ['de', 'en'] as const) {
        setLang(l, false);
        const text = whenChipText({ day, hour: 18, minute: 15 }, true, 15, 'typical');
        expect(text).not.toMatch(/Uhr/);
        expect(text.length).toBeLessThanOrEqual(20);
        expect(whenChipText({ day, hour: 18 }, true, 15, 'typical', true)).toMatch(
          l === 'de' ? /18:15 Uhr · Typisch$/ : /18:15 · Typical$/,
        );
      }
    } finally {
      setLang('de', false);
      vi.unstubAllGlobals();
    }
  });

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

describe('day labels', () => {
  const now = new Date('2026-10-12T08:00:00Z'); // Monday in Berlin
  it('names today, tomorrow and the days after', () => {
    expect(dayLabel('20261012', now)).toBe('Heute');
    expect(dayLabel('20261013', now)).toBe('Morgen');
    expect(dayLabel('20261014', now)).toBe('Mi 14.');
    expect(dateLabel('20261101')).toBe('So 1.');
    expect(dayLabel('weekend', now)).toBe('Sa+So');
  });

  it('leaves "Heute" out of the short chip text only', () => {
    const [today, tomorrow] = upcomingDays();
    expect(pillText({ day: today!, hour: 18 }, false, '18 Uhr', true)).toBe('ab 18 Uhr');
    expect(pillText({ day: today!, hour: 19 }, true, '19 Uhr', true)).toBe('an 19 Uhr');
    expect(pillText({ day: today!, hour: 18 }, false, '18 Uhr')).toBe('Heute ab 18 Uhr');
    expect(pillText({ day: tomorrow!, hour: 8 }, false, '8 Uhr', true)).toBe('Morgen ab 8 Uhr');
    expect(pillText({ day: 'weekday', hour: 10 }, false, '10 Uhr', true)).toBe('Mo–Fr ab 10 Uhr');
  });
});
