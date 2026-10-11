import { describe, expect, it } from 'vitest';
import { desertThresholds, whenFromParams, windowName } from './when';

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

  it('uses the night desert thresholds before 05:00', () => {
    expect(desertThresholds({ day: 'weekend', hour: 4 })).toEqual([1200, 1800]);
    expect(desertThresholds({ day: 'weekend', hour: 5 })).toEqual([600, 900]);
  });
});
