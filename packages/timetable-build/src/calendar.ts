// Service calendar handling: which GTFS services run on a given date, and
// which date we use as the "typical weekday".

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Dates are handled as YYYYMMDD strings (GTFS style) and converted via UTC to avoid DST issues. */
export function toDate(yyyymmdd: string): Date {
  return new Date(
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8)),
    ),
  );
}

export function fromDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function addDays(yyyymmdd: string, days: number): string {
  const d = toDate(yyyymmdd);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDate(d);
}

export function isoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function easterSunday(year: number): string {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/** Public holidays in Berlin for a year (national ones plus Frauentag on 8 March). */
export function berlinHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const fixed = ['0101', '0308', '0501', '1003', '1225', '1226'].map((md) => `${year}${md}`);
  const movable = [-2, 1, 39, 50].map((offset) => addDays(easter, offset));
  return new Set([...fixed, ...movable]);
}

export function isBerlinHoliday(yyyymmdd: string): boolean {
  return berlinHolidays(Number(yyyymmdd.slice(0, 4))).has(yyyymmdd);
}

/**
 * The reference day: the first Tuesday, Wednesday or Thursday at least three
 * days after the feed start that is not a Berlin public holiday.
 */
export function pickReferenceDay(feedStart: string): string {
  let date = addDays(feedStart, 3);
  for (let i = 0; i < 60; i++, date = addDays(date, 1)) {
    const weekday = toDate(date).getUTCDay();
    if (weekday >= 2 && weekday <= 4 && !isBerlinHoliday(date)) return date;
  }
  throw new Error(`No suitable reference weekday found after ${feedStart}`);
}

/** The first Saturday after `weekday` that is not a public holiday (nor is the Sunday after it). */
export function pickWeekendDay(weekday: string): string {
  let date = addDays(weekday, 1);
  for (let i = 0; i < 60; i++, date = addDays(date, 1)) {
    if (toDate(date).getUTCDay() !== 6) continue;
    if (!isBerlinHoliday(date) && !isBerlinHoliday(addDays(date, 1))) return date;
  }
  throw new Error(`No suitable reference Saturday found after ${weekday}`);
}

export interface CalendarRow {
  serviceId: string;
  days: boolean[]; // indexed Sunday = 0 … Saturday = 6
  start: string;
  end: string;
}

export interface CalendarDateRow {
  serviceId: string;
  date: string;
  exceptionType: number; // 1 = added, 2 = removed
}

export class ServiceCalendar {
  private readonly calendar = new Map<string, CalendarRow>();
  private readonly exceptions = new Map<string, Map<string, number>>();

  addCalendar(row: CalendarRow): void {
    this.calendar.set(row.serviceId, row);
  }

  addException(row: CalendarDateRow): void {
    let byDate = this.exceptions.get(row.serviceId);
    if (!byDate) this.exceptions.set(row.serviceId, (byDate = new Map()));
    byDate.set(row.date, row.exceptionType);
  }

  /** Earliest date any service is defined for. */
  startDate(): string {
    let min = '99999999';
    for (const row of this.calendar.values()) if (row.start < min) min = row.start;
    if (this.calendar.size === 0) {
      for (const byDate of this.exceptions.values())
        for (const date of byDate.keys()) if (date < min) min = date;
    }
    if (min === '99999999') throw new Error('Feed has no calendar data');
    return min;
  }

  isActive(serviceId: string, date: string): boolean {
    const exception = this.exceptions.get(serviceId)?.get(date);
    if (exception === 1) return true;
    if (exception === 2) return false;
    const row = this.calendar.get(serviceId);
    if (!row || date < row.start || date > row.end) return false;
    return row.days[toDate(date).getUTCDay()] ?? false;
  }

  activeServices(date: string): Set<string> {
    const ids = new Set([...this.calendar.keys(), ...this.exceptions.keys()]);
    return new Set([...ids].filter((id) => this.isActive(id, date)));
  }
}

export function parseCalendarRow(get: (c: string) => string): CalendarRow {
  return {
    serviceId: get('service_id'),
    days: WEEKDAYS.map((d) => get(d) === '1'),
    start: get('start_date'),
    end: get('end_date'),
  };
}
