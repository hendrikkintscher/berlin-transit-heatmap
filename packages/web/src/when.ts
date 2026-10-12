// The time a map is computed for: a real date in the coming week (today's actual service,
// construction and Ersatzverkehr included) or a typical weekday or weekend (a Saturday),
// and the hour in which trips depart. Each pair has its own timetable file, e.g.
// timetable-20261012-10.bin or timetable-weekend-02.bin.

export type DayType = 'weekday' | 'weekend';
/** A typical day, or a real date as YYYYMMDD. */
export type Day = DayType | string;
export interface When {
  day: Day;
  hour: number;
  /** An exact time (always "Nächste"): minutes into the hour. Without it, the full hour. */
  minute?: number;
}

/** Real dates the app offers: today and the six days after it (the build has eight). */
export const DATE_DAYS = 7;

export const isDate = (day: Day) => /^\d{8}$/.test(day);

/** YYYYMMDD `days` after `day`. */
export function addDays(day: string, days: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) + days));
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/** "2026-10-14" for "20261014". */
export const isoDay = (day: string) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;

/** Day of the week of a YYYYMMDD date, Sunday = 0. */
export const weekdayOf = (day: string) =>
  new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay();

/** The typical day standing in for `day`: Saturday and Sunday count as the weekend. */
export function dayType(day: Day): DayType {
  if (!isDate(day)) return day as DayType;
  const wd = weekdayOf(day);
  return wd === 0 || wd === 6 ? 'weekend' : 'weekday';
}

/** Today and the next days in Berlin, YYYYMMDD. */
export function upcomingDays(now = new Date()): string[] {
  const today = whenAt(now).day;
  return Array.from({ length: DATE_DAYS }, (_, i) => addDays(today, i));
}

export const DEFAULT_WHEN: When = { day: 'weekday', hour: 10 };

/** Night service runs until about 05:00; deserts use the looser night thresholds then. */
export const isNightHour = (hour: number) => hour < 5;

export function windowName({ day, hour }: When): string {
  return `${day}-${String(hour).padStart(2, '0')}`;
}

/** The time in a link: the window name, with the minutes of an exact time ("20261014-0835"). */
export function whenParam(w: When): string {
  return windowName(w) + (w.minute !== undefined ? String(w.minute).padStart(2, '0') : '');
}

/** The same time on the full hour. */
export const fullHour = ({ day, hour }: When): When => ({ day, hour });

/**
 * "weekend-02" -> { day: 'weekend', hour: 2 }, "20261014-08" -> { day: '20261014', hour: 8 },
 * "20261014-0835" -> the same at 08:35; null if it isn't one. A date outside the coming week
 * (an old link) becomes its typical day.
 */
export function parseWhen(v: string | null, now = new Date()): When | null {
  const m = /^(weekday|weekend|\d{8})-(\d{1,2})(\d{2})?$/.exec(v ?? '');
  if (!m || Number(m[2]) >= 24 || Number(m[3] ?? 0) >= 60) return null;
  const day = isDate(m[1]!) && !upcomingDays(now).includes(m[1]!) ? dayType(m[1]!) : m[1]!;
  return { day, hour: Number(m[2]), ...(m[3] ? { minute: Number(m[3]) } : {}) };
}

/** Today's date and the hour in Berlin at `date`. */
export function whenAt(date: Date): When {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const day = get('year') + get('month') + get('day');
    const hour = Number(get('hour'));
    if (!isDate(day) || !(hour >= 0 && hour < 24)) return DEFAULT_WHEN;
    return { day, hour };
  } catch {
    return DEFAULT_WHEN;
  }
}

/** Reads ?t=20261014-08 or ?t=weekend-02, or the older ?w=night (weekday 02:00); otherwise `fallback`. */
export function whenFromParams(
  p: URLSearchParams,
  fallback: When = DEFAULT_WHEN,
  now = new Date(),
): When {
  const w = parseWhen(p.get('t'), now);
  if (w) return w;
  if (p.get('w') === 'night') return { day: 'weekday', hour: 2 };
  return fallback;
}

export type Direction = 'depart' | 'arrive';

/**
 * The timetable file a map is computed from. Departing uses the chosen hour's file.
 * Arriving in an hour needs trips that started earlier, so it uses the hour before
 * (whose file also holds the trips running into the next hour). Midnight at the
 * weekend follows a Friday evening, for which the weekday file stands in; midnight on a
 * date follows the evening before.
 */
export function computeWindow(when: When, direction: Direction): string {
  if (direction === 'depart') return windowName(when);
  if (when.hour > 0) return windowName({ ...when, hour: when.hour - 1 });
  if (isDate(when.day)) return windowName({ day: addDays(when.day, -1), hour: 23 });
  return windowName({ day: 'weekday', hour: 23 });
}

/**
 * The file standing in for a date's hour that has no file (the evening before today, or
 * a day the build has not reached): the same hour of its typical day. Null for typical ones.
 */
export function typicalWindow(window: string): string | null {
  const m = /^(\d{8})-(\d{2})$/.exec(window);
  return m ? `${dayType(m[1]!)}-${m[2]}` : null;
}

/**
 * A night hour of the evening of `day`: 0–4 Uhr are on the next date (a typical day's
 * night hours are in its own file).
 */
export function eveningWindow(day: Day, hour: number): string {
  return windowName({ day: isDate(day) && hour < 5 ? addDays(day, 1) : day, hour });
}

/** [light, strong] desert thresholds in seconds, as Hendrik chose: 10/15 min by day, 20/30 at night. */
export function desertThresholds(when: When): readonly [number, number] {
  return isNightHour(when.hour) ? [1200, 1800] : [600, 900];
}

/**
 * "Nächste" leaves at the exact time chosen, else now when `when` is the current hour in
 * Berlin (today, or the typical day of today's kind), otherwise on the hour:
 * seconds into the chosen hour.
 */
export function leaveOffset(when: When, now = new Date()): number {
  if (when.minute !== undefined) return when.minute * 60;
  const w = whenAt(now);
  const today = when.day === w.day || when.day === dayType(w.day);
  if (!today || w.hour !== when.hour) return 0;
  // Berlin is a whole number of hours from UTC, so minutes and seconds match.
  return now.getUTCMinutes() * 60 + now.getUTCSeconds();
}

/**
 * Whether `hour` of today's date is already over: departing in an earlier hour, or
 * arriving by an hour that has begun (arriving "an 18 Uhr" means by 18:00).
 */
export function isPastHour(
  day: Day,
  hour: number,
  direction: Direction,
  now = new Date(),
): boolean {
  const w = whenAt(now);
  if (day !== w.day) return false;
  return direction === 'arrive' ? hour <= w.hour : hour < w.hour;
}

/**
 * Whether a time of today's date is over: as isPastHour for a full hour; an exact time
 * once its minute has passed (arriving: once it has come).
 */
export function isPastTime(when: When, direction: Direction, now = new Date()): boolean {
  if (when.minute === undefined) return isPastHour(when.day, when.hour, direction, now);
  const w = whenAt(now);
  if (when.day !== w.day) return false;
  const chosen = when.hour * 60 + when.minute;
  const current = w.hour * 60 + now.getUTCMinutes();
  return direction === 'arrive' ? chosen <= current : chosen < current;
}

/**
 * The current hour when a date's time chosen earlier is over by now (the app stayed open
 * past it or past midnight), so "Nächste" never leaves in the past; null otherwise.
 */
export function catchUp(when: When, direction: Direction, now = new Date()): When | null {
  if (!isDate(when.day)) return null;
  const w = whenAt(now);
  if (when.day > w.day || (when.day === w.day && !isPastTime(when, direction, now))) return null;
  return direction === 'arrive' ? arriveWhen(w, now) : w;
}

/**
 * Switching to arriving in an hour that has begun moves on to the next full hour
 * (18:02 -> an 19 Uhr; 23:10 -> tomorrow 0 Uhr), so the map never starts in the past.
 */
export function arriveWhen(when: When, now = new Date()): When {
  if (when.minute !== undefined) return when;
  const w = whenAt(now);
  const today = when.day === w.day || when.day === dayType(w.day);
  if (!today || when.hour !== w.hour) return when;
  if (when.hour < 23) return { ...when, hour: when.hour + 1 };
  return { day: isDate(when.day) ? addDays(when.day, 1) : when.day, hour: 0 };
}

/** Whether `when` is "Jetzt": today's current hour in Berlin, on the clock (no exact time). */
export function isNow(when: When, now = new Date()): boolean {
  const w = whenAt(now);
  return when.minute === undefined && when.day === w.day && when.hour === w.hour;
}

/**
 * Seconds since midnight in Berlin now, when `when` is today (or the typical day of
 * today's kind), so a trip's times can count down; null for another day.
 */
export function clockNow(when: When, now = new Date()): number | null {
  const w = whenAt(now);
  if (when.day !== w.day && when.day !== dayType(w.day)) return null;
  return w.hour * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
}

/** "+15", "+30", "+60" in the time panel: that many minutes from now in Berlin, exact. */
export function laterWhen(minutes: number, now = new Date()): When {
  const at = new Date(now.getTime() + minutes * 60_000);
  return { ...whenAt(at), minute: at.getUTCMinutes() };
}
