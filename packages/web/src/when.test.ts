import { describe, expect, it } from 'vitest';
import {
  arriveWhen,
  computeWindow,
  dayType,
  desertThresholds,
  eveningWindow,
  isPastHour,
  catchUp,
  leaveOffset,
  parseWhen,
  typicalWindow,
  upcomingDays,
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

  it('opens at today and the current hour in Berlin', () => {
    // 2026-10-13 is a Tuesday; Berlin is UTC+2 in October and UTC+1 in January.
    expect(whenAt(new Date('2026-10-13T07:30:00Z'))).toEqual({ day: '20261013', hour: 9 });
    expect(whenAt(new Date('2026-10-16T22:10:00Z'))).toEqual({ day: '20261017', hour: 0 });
    expect(whenAt(new Date('2026-10-18T21:59:00Z'))).toEqual({ day: '20261018', hour: 23 });
    expect(whenAt(new Date('2027-01-11T23:00:00Z'))).toEqual({ day: '20270112', hour: 0 });
    expect(whenFromParams(params(''), { day: 'weekend', hour: 3 })).toEqual({
      day: 'weekend',
      hour: 3,
    });
  });

  it('offers today and the six days after it, across a month end', () => {
    expect(upcomingDays(new Date('2026-10-28T10:00:00Z'))).toEqual([
      '20261028',
      '20261029',
      '20261030',
      '20261031',
      '20261101',
      '20261102',
      '20261103',
    ]);
  });

  it('reads a date in a link, and turns an old one into its typical day', () => {
    const now = new Date('2026-10-12T08:00:00Z');
    expect(whenFromParams(params('t=20261014-08'), undefined, now)).toEqual({
      day: '20261014',
      hour: 8,
    });
    // A week later, and a Saturday long gone.
    expect(parseWhen('20261019-08', now)).toEqual({ day: 'weekday', hour: 8 });
    expect(parseWhen('20261003-23', now)).toEqual({ day: 'weekend', hour: 23 });
    expect(windowName({ day: '20261014', hour: 8 })).toBe('20261014-08');
  });

  it('knows the typical day standing in for a date', () => {
    expect(dayType('20261016')).toBe('weekday');
    expect(dayType('20261017')).toBe('weekend');
    expect(dayType('20261018')).toBe('weekend');
    expect(typicalWindow('20261018-02')).toBe('weekend-02');
    expect(typicalWindow('weekday-10')).toBeNull();
  });

  it('puts the hours after midnight of an evening on the next date', () => {
    expect(eveningWindow('20261012', 23)).toBe('20261012-23');
    expect(eveningWindow('20261012', 1)).toBe('20261013-01');
    expect(eveningWindow('weekday', 1)).toBe('weekday-01');
  });

  it('leaves now only in the current hour of today or its typical day', () => {
    const now = new Date('2026-10-13T08:20:30Z'); // Tuesday, 10:20:30 in Berlin
    expect(leaveOffset({ day: '20261013', hour: 10 }, now)).toBe(20 * 60 + 30);
    expect(leaveOffset({ day: 'weekday', hour: 10 }, now)).toBe(20 * 60 + 30);
    expect(leaveOffset({ day: 'weekend', hour: 10 }, now)).toBe(0);
    expect(leaveOffset({ day: '20261014', hour: 10 }, now)).toBe(0);
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
    expect(computeWindow({ day: '20261014', hour: 0 }, 'arrive')).toBe('20261013-23');
  });

  it('greys out the hours that are over today', () => {
    const now = new Date('2026-10-12T16:02:00Z'); // 18:02 in Berlin
    expect(isPastHour('20261012', 17, 'depart', now)).toBe(true);
    expect(isPastHour('20261012', 18, 'depart', now)).toBe(false);
    expect(isPastHour('20261012', 18, 'arrive', now)).toBe(true);
    expect(isPastHour('20261012', 19, 'arrive', now)).toBe(false);
    expect(isPastHour('20261013', 8, 'depart', now)).toBe(false);
    expect(isPastHour('weekday', 8, 'depart', now)).toBe(false);
  });

  it('moves a date hour that is over on to now', () => {
    const now = new Date('2026-10-12T09:05:00Z'); // 11:05 in Berlin
    expect(catchUp({ day: '20261012', hour: 10 }, 'depart', now)).toEqual({
      day: '20261012',
      hour: 11,
    });
    expect(catchUp({ day: '20261012', hour: 11 }, 'depart', now)).toBeNull();
    expect(catchUp({ day: '20261012', hour: 14 }, 'depart', now)).toBeNull();
    expect(catchUp({ day: '20261013', hour: 8 }, 'depart', now)).toBeNull();
    expect(catchUp({ day: 'weekday', hour: 10 }, 'depart', now)).toBeNull();
    expect(catchUp({ day: '20261011', hour: 23 }, 'depart', now)).toEqual({
      day: '20261012',
      hour: 11,
    });
    expect(catchUp({ day: '20261012', hour: 11 }, 'arrive', now)).toEqual({
      day: '20261012',
      hour: 12,
    });
    expect(catchUp({ day: '20261012', hour: 12 }, 'arrive', now)).toBeNull();
  });

  it('arrives in the next full hour when switching from now', () => {
    const now = new Date('2026-10-12T16:02:00Z');
    expect(arriveWhen({ day: '20261012', hour: 18 }, now)).toEqual({ day: '20261012', hour: 19 });
    expect(arriveWhen({ day: 'weekday', hour: 18 }, now)).toEqual({ day: 'weekday', hour: 19 });
    expect(arriveWhen({ day: '20261012', hour: 20 }, now)).toEqual({ day: '20261012', hour: 20 });
    const late = new Date('2026-10-12T21:10:00Z'); // 23:10
    expect(arriveWhen({ day: '20261012', hour: 23 }, late)).toEqual({ day: '20261013', hour: 0 });
  });
});
