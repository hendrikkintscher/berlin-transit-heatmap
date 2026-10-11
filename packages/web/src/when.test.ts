import { describe, expect, it } from 'vitest';
import {
  computeWindow,
  desertThresholds,
  parseWhen,
  whenAt,
  whenFromParams,
  windowName,
} from './when';

const params = (q: string) => new URLSearchParams(q);

describe('when', () => {
  it('names the timetable file for a day type and hour', () => {
    expect(windowName({ day: 'weekday', hour: 10 })).toBe('weekday-10');
    expect(windowName({ day: 'weekend', hour: 2 })).toBe('weekend-02');
  });

  it('reads the URL, including the old night link', () => {
    expect(whenFromParams(params('t=weekend-02'))).toEqual({ day: 'weekend', hour: 2 });
    expect(whenFromParams(params('w=night'))).toEqual({ day: 'weekday', hour: 2 });
    expect(whenFromParams(params(''))).toEqual({ day: 'weekday', hour: 10 });
    expect(whenFromParams(params('t=weekday-24'))).toEqual({ day: 'weekday', hour: 10 });
  });

  it('opens at the current day type and hour in Berlin', () => {
    // 2026-10-13 is a Tuesday; Berlin is UTC+2 in October and UTC+1 in January.
    expect(whenAt(new Date('2026-10-13T07:30:00Z'))).toEqual({ day: 'weekday', hour: 9 });
    expect(whenAt(new Date('2026-10-16T22:10:00Z'))).toEqual({ day: 'weekend', hour: 0 });
    expect(whenAt(new Date('2026-10-18T21:59:00Z'))).toEqual({ day: 'weekend', hour: 23 });
    expect(whenAt(new Date('2027-01-11T23:00:00Z'))).toEqual({ day: 'weekday', hour: 0 });
    expect(whenFromParams(params(''), { day: 'weekend', hour: 3 })).toEqual({
      day: 'weekend',
      hour: 3,
    });
  });

  it('uses the night desert thresholds before 05:00', () => {
    expect(desertThresholds({ day: 'weekend', hour: 4 })).toEqual([1200, 1800]);
    expect(desertThresholds({ day: 'weekend', hour: 5 })).toEqual([600, 900]);
  });

  it('parses a window name', () => {
    expect(parseWhen('weekday-07')).toEqual({ day: 'weekday', hour: 7 });
    expect(parseWhen('nonsense')).toBeNull();
  });

  it('uses the previous hour file for arriving', () => {
    expect(computeWindow({ day: 'weekday', hour: 10 }, 'depart')).toBe('weekday-10');
    expect(computeWindow({ day: 'weekday', hour: 10 }, 'arrive')).toBe('weekday-09');
    expect(computeWindow({ day: 'weekday', hour: 0 }, 'arrive')).toBe('weekday-23');
    expect(computeWindow({ day: 'weekend', hour: 0 }, 'arrive')).toBe('weekday-23');
    expect(computeWindow({ day: 'weekend', hour: 5 }, 'arrive')).toBe('weekend-04');
  });
});
