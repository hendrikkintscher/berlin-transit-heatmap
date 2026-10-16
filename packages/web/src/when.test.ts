import { describe, expect, it } from 'vitest';
import {
  arriveWhen,
  computeWindow,
  dayType,
  desertThresholds,
  eveningWindow,
  isNow,
  laterWhen,
  clockNow,
  nextDayWindow,
  rolledWindow,
  rollsOn,
  isPastHour,
  catchUp,
  whenParam,
  leaveOffset,
  parseWhen,
  tripWhen,
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

  it('keeps an exact time: link, leaving and arriving, catching up', () => {
    const now = new Date('2026-10-12T16:20:00Z'); // 18:20 in Berlin
    const w = { day: '20261012', hour: 18, minute: 35 };
    expect(whenParam(w)).toBe('20261012-1835');
    expect(whenParam({ day: 'weekend', hour: 2 })).toBe('weekend-02');
    expect(parseWhen('20261012-1835', now)).toEqual(w);
    expect(parseWhen('20261012-0805', now)).toEqual({ day: '20261012', hour: 8, minute: 5 });
    expect(parseWhen('20261012-1860', now)).toBeNull();
    expect(computeWindow(w, 'depart')).toBe('20261012-18');
    expect(computeWindow(w, 'arrive')).toBe('20261012-17');
    // Leaving at 18:35 even though it is 18:20 now; arriving keeps the minute.
    expect(leaveOffset(w, now)).toBe(35 * 60);
    expect(leaveOffset({ day: '20261012', hour: 20, minute: 0 }, now)).toBe(0);
    expect(arriveWhen(w, now)).toBe(w);
    expect(catchUp(w, 'depart', now)).toBeNull();
    expect(catchUp({ ...w, minute: 10 }, 'depart', now)).toEqual({ day: '20261012', hour: 18 });
    expect(catchUp({ ...w, minute: 20 }, 'arrive', now)).toEqual({ day: '20261012', hour: 19 });
  });

  it('knows Jetzt: today, this hour, on the clock', () => {
    const now = new Date('2026-10-12T16:20:00Z');
    expect(isNow({ day: '20261012', hour: 18 }, now)).toBe(true);
    expect(isNow({ day: '20261012', hour: 18, minute: 20 }, now)).toBe(false);
    expect(isNow({ day: 'weekday', hour: 18 }, now)).toBe(false);
    expect(isNow({ day: '20261012', hour: 19 }, now)).toBe(false);
  });
});

describe('tripWhen', () => {
  // A trip leaving 10:57:20 and arriving 11:54:30.
  const [leave, arrive] = [10 * 3600 + 57 * 60 + 20, 11 * 3600 + 54 * 60 + 30];
  it('takes the minute of the trip for Nächste: arriving by it, leaving at it', () => {
    expect(tripWhen('weekday', arrive, 'arrive')).toEqual({ day: 'weekday', hour: 11, minute: 55 });
    expect(tripWhen('weekday', leave, 'depart')).toEqual({ day: 'weekday', hour: 10, minute: 57 });
  });
  it('takes the hour the trip arrives or leaves in for Typisch and Bestfall', () => {
    // "Ankunft 11 bis 12 Uhr", "ab 10 Uhr".
    expect(tripWhen('weekday', arrive, 'arrive', false)).toEqual({ day: 'weekday', hour: 11 });
    expect(tripWhen('weekday', leave, 'depart', false)).toEqual({ day: 'weekday', hour: 10 });
  });
  it('gives up past midnight', () => {
    expect(tripWhen('weekday', 23 * 3600 + 59 * 60 + 1, 'arrive')).toBeNull();
    expect(tripWhen('weekday', 24 * 3600 + 60, 'arrive', false)).toBeNull();
  });
});

describe('laterWhen', () => {
  it('leaves that many minutes from now, across midnight too', () => {
    expect(laterWhen(30, new Date('2026-10-13T07:20:00Z'))).toEqual({
      day: '20261013',
      hour: 9,
      minute: 50,
    });
    expect(laterWhen(30, new Date('2026-10-13T21:45:00Z'))).toEqual({
      day: '20261014',
      hour: 0,
      minute: 15,
    });
  });
});

describe('rollsOn', () => {
  const when = { day: '20261013', hour: 17 };
  it('rolls on within the chosen hour and the two after it', () => {
    expect(rollsOn(when, 17 * 3600 + 59 * 60)).toBe(true);
    expect(rollsOn(when, 18 * 3600)).toBe(true);
    expect(rollsOn(when, 19 * 3600 + 59 * 60)).toBe(true);
  });
  it("stops once the next hour's file no longer covers the ride", () => {
    expect(rollsOn(when, 20 * 3600)).toBe(false);
  });
  it('rolls on past midnight after a late hour', () => {
    expect(rollsOn({ day: 'weekday', hour: 23 }, 25 * 3600 + 59 * 60)).toBe(true);
    expect(rollsOn({ day: 'weekday', hour: 23 }, 26 * 3600)).toBe(false);
  });
});

describe('rolledWindow', () => {
  const when = { day: '20261013', hour: 17, minute: 40 };
  it('keeps the chosen hour within it', () => {
    expect(rolledWindow(when, 17 * 3600 + 59 * 60)).toBeNull();
  });
  it("takes the next hour's file once the clock is past it", () => {
    expect(rolledWindow(when, 18 * 3600)).toEqual({ window: '20261013-18', shift: 0 });
    expect(rolledWindow(when, 19 * 3600 + 1800)).toEqual({ window: '20261013-18', shift: 0 });
    expect(rolledWindow({ day: 'weekend', hour: 9 }, 10 * 3600 + 1800)).toEqual({
      window: 'weekend-10',
      shift: 0,
    });
  });
  it("takes the next day's 0 Uhr after 23 Uhr, a day behind", () => {
    expect(rolledWindow({ day: '20261013', hour: 23 }, 23 * 3600 + 600)).toBeNull();
    expect(rolledWindow({ day: '20261013', hour: 23 }, 24 * 3600 + 600)).toEqual({
      window: '20261014-00',
      shift: 86400,
    });
  });
});

describe('nextDayWindow', () => {
  // Berlin is two hours ahead of UTC in October.
  const thursday = new Date('2026-10-15T21:30:00Z');
  const friday = new Date('2026-10-16T21:30:00Z');
  const fridayNight = new Date('2026-10-16T22:30:00Z');
  const sunday = new Date('2026-10-18T21:30:00Z');
  it("is the next date's 0 Uhr", () => {
    expect(nextDayWindow({ day: '20261016', hour: 23 }, friday)).toBe('20261017-00');
  });
  it("follows the real tomorrow for today's typical day", () => {
    expect(nextDayWindow({ day: 'weekday', hour: 23 }, thursday)).toBe('weekday-00');
    expect(nextDayWindow({ day: 'weekday', hour: 23 }, friday)).toBe('weekend-00');
    expect(nextDayWindow({ day: 'weekday', hour: 23 }, fridayNight)).toBe('weekend-00');
    expect(nextDayWindow({ day: 'weekend', hour: 23 }, sunday)).toBe('weekday-00');
  });
  it('keeps a typical day that is not today', () => {
    expect(nextDayWindow({ day: 'weekend', hour: 23 }, thursday)).toBe('weekend-00');
  });
});

describe('clockNow', () => {
  // Saturday 00:30 in Berlin.
  const night = new Date('2026-10-16T22:30:00Z');
  it("counts today's seconds", () => {
    expect(clockNow({ day: '20261016', hour: 20 }, new Date('2026-10-16T18:30:00Z'))).toBe(
      20 * 3600 + 1800,
    );
    expect(clockNow({ day: 'weekend', hour: 0 }, night)).toBe(1800);
  });
  it('goes on from a late evening in the night after it', () => {
    expect(clockNow({ day: '20261016', hour: 23 }, night)).toBe(24 * 3600 + 1800);
    expect(clockNow({ day: 'weekday', hour: 22 }, night)).toBe(24 * 3600 + 1800);
  });
  it('is null for another day', () => {
    expect(clockNow({ day: '20261016', hour: 10 }, night)).toBeNull();
    expect(clockNow({ day: '20261016', hour: 23 }, new Date('2026-10-17T08:00:00Z'))).toBeNull();
    expect(clockNow({ day: 'weekday', hour: 10 }, night)).toBeNull();
  });
});
