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

/** Reads ?t=weekend-02, or the older ?w=night (weekday 02:00). */
export function whenFromParams(p: URLSearchParams): When {
  const m = /^(weekday|weekend)-(\d{1,2})$/.exec(p.get('t') ?? '');
  if (m && Number(m[2]) < 24) return { day: m[1] as DayType, hour: Number(m[2]) };
  if (p.get('w') === 'night') return { day: 'weekday', hour: 2 };
  return DEFAULT_WHEN;
}

/** [light, strong] desert thresholds in seconds, as Hendrik chose: 10/15 min by day, 20/30 at night. */
export function desertThresholds(when: When): readonly [number, number] {
  return isNightHour(when.hour) ? [1200, 1800] : [600, 900];
}
