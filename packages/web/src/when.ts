// The time a map is computed for: a weekday or the weekend (a Saturday), and the hour in
// which trips depart. Each pair has its own timetable file, e.g. timetable-weekend-02.json.

export type DayType = 'weekday' | 'weekend';
export interface When {
  day: DayType;
  hour: number;
}

export const DEFAULT_WHEN: When = { day: 'weekday', hour: 10 };

/** Night service runs until about 05:00; deserts use the looser night thresholds then. */
export const isNightHour = (hour: number) => hour < 5;

export function windowName({ day, hour }: When): string {
  return `${day}-${String(hour).padStart(2, '0')}`;
}

/** "weekend-02" -> { day: 'weekend', hour: 2 }; null if it isn't one. */
export function parseWhen(v: string | null): When | null {
  const m = /^(weekday|weekend)-(\d{1,2})$/.exec(v ?? '');
  return m && Number(m[2]) < 24 ? { day: m[1] as DayType, hour: Number(m[2]) } : null;
}

/** The day type and hour in Berlin at `date`; Saturday and Sunday count as the weekend. */
export function whenAt(date: Date): When {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    if (!weekday || !(hour >= 0 && hour < 24)) return DEFAULT_WHEN;
    return { day: weekday === 'Sat' || weekday === 'Sun' ? 'weekend' : 'weekday', hour };
  } catch {
    return DEFAULT_WHEN;
  }
}

/** Reads ?t=weekend-02, or the older ?w=night (weekday 02:00); otherwise `fallback`. */
export function whenFromParams(p: URLSearchParams, fallback: When = DEFAULT_WHEN): When {
  const w = parseWhen(p.get('t'));
  if (w) return w;
  if (p.get('w') === 'night') return { day: 'weekday', hour: 2 };
  return fallback;
}

export type Direction = 'depart' | 'arrive';

/**
 * The timetable file a map is computed from. Departing uses the chosen hour's file.
 * Arriving in an hour needs trips that started earlier, so it uses the hour before
 * (whose file also holds the trips running into the next hour). Midnight at the
 * weekend follows a Friday evening, for which the weekday file stands in.
 */
export function computeWindow(when: When, direction: Direction): string {
  if (direction === 'depart') return windowName(when);
  if (when.hour > 0) return windowName({ ...when, hour: when.hour - 1 });
  return windowName({ day: 'weekday', hour: 23 });
}

/** [light, strong] desert thresholds in seconds, as Hendrik chose: 10/15 min by day, 20/30 at night. */
export function desertThresholds(when: When): readonly [number, number] {
  return isNightHour(when.hour) ? [1200, 1800] : [600, 900];
}

/**
 * "Nächste" leaves now when `when` is the current hour in Berlin, otherwise on the hour:
 * seconds into the chosen hour.
 */
export function leaveOffset(when: When, now = new Date()): number {
  const w = whenAt(now);
  if (w.day !== when.day || w.hour !== when.hour) return 0;
  // Berlin is a whole number of hours from UTC, so minutes and seconds match.
  return now.getUTCMinutes() * 60 + now.getUTCSeconds();
}
