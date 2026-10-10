import { describe, expect, it } from 'vitest';
import { fillTimes, modeOf } from '../src/build.ts';
import { berlinHolidays, pickReferenceDay, ServiceCalendar } from '../src/calendar.ts';
import { parseTime, splitCsvLine } from '../src/csv.ts';
import { distanceM, forEachNearbyPair } from '../src/geo.ts';

describe('csv', () => {
  it('splits quoted fields', () => {
    expect(splitCsvLine('a,"b,c","d ""e""",')).toEqual(['a', 'b,c', 'd "e"', '']);
    expect(splitCsvLine('1,2,3')).toEqual(['1', '2', '3']);
  });

  it('parses GTFS times past midnight', () => {
    expect(parseTime('10:05:30')).toBe(36330);
    expect(parseTime('26:00:00')).toBe(93600);
    expect(parseTime('7:00:00')).toBe(25200);
    expect(parseTime('')).toBeNaN();
  });
});

describe('calendar', () => {
  it('knows the Berlin holidays of 2026', () => {
    expect([...berlinHolidays(2026)].sort()).toEqual([
      '20260101',
      '20260308',
      '20260403', // Good Friday
      '20260406', // Easter Monday
      '20260501',
      '20260514', // Ascension
      '20260525', // Whit Monday
      '20261003',
      '20261225',
      '20261226',
    ]);
  });

  it('picks a Tue–Thu, skipping holidays', () => {
    expect(pickReferenceDay('20261008')).toBe('20261013');
    expect(pickReferenceDay('20261210')).toBe('20261215');
    // +3 = Thu 14 May 2026 (Ascension) -> next Tue–Thu is 19 May.
    expect(pickReferenceDay('20260511')).toBe('20260519');
  });

  it('combines calendar and calendar_dates', () => {
    const cal = new ServiceCalendar();
    const days = [false, true, true, true, true, true, false];
    cal.addCalendar({ serviceId: 'WD', days, start: '20261001', end: '20261031' });
    cal.addException({ serviceId: 'WD', date: '20261014', exceptionType: 2 });
    cal.addException({ serviceId: 'X', date: '20261017', exceptionType: 1 });
    expect(cal.isActive('WD', '20261013')).toBe(true);
    expect(cal.isActive('WD', '20261014')).toBe(false);
    expect(cal.isActive('WD', '20261017')).toBe(false); // Saturday
    expect(cal.isActive('WD', '20261102')).toBe(false); // after end
    expect(cal.isActive('X', '20261017')).toBe(true);
    expect(cal.startDate()).toBe('20261001');
  });
});

describe('geo', () => {
  it('measures distances', () => {
    // Alexanderplatz to Zoologischer Garten is about 5.7 km.
    expect(distanceM(52.5219, 13.4132, 52.5069, 13.3324) / 1000).toBeCloseTo(5.75, 1);
  });

  it('finds all pairs within the radius', () => {
    const points = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5027, lon: 13.4 }, // ~300 m north
      { lat: 52.51, lon: 13.4 }, // ~1.1 km north
    ];
    const pairs: [number, number][] = [];
    forEachNearbyPair(points, 400, (i, j) => pairs.push([i, j]));
    expect(pairs).toEqual([[0, 1]]);
  });
});

describe('build helpers', () => {
  it('maps GTFS route types to modes', () => {
    expect([109, 400, 900, 700, 3, 1000, 100, 106, 2, 1, 0, 1700].map(modeOf)).toEqual([
      'sbahn',
      'ubahn',
      'tram',
      'bus',
      'bus',
      'ferry',
      'regional',
      'regional',
      'regional',
      'ubahn',
      'tram',
      'other',
    ]);
  });

  it('fills and smooths times', () => {
    const times = [NaN, 100, NaN, NaN, 160, 150, NaN];
    expect(fillTimes(times)).toBe(true);
    expect(times).toEqual([100, 100, 120, 140, 160, 160, 160]);
    expect(fillTimes([NaN, 5])).toBe(false);
  });
});
