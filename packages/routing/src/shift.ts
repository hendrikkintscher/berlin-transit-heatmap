import type { Timetable } from './types';

/**
 * The timetable with every time `seconds` later, so one day's file can be read in the
 * day before's terms (its 0:10 as 24:10). Stops, footpaths and dwells are unchanged.
 */
export function shiftTimetable(tt: Timetable, seconds: number): Timetable {
  return {
    ...tt,
    windowStart: tt.windowStart + seconds,
    windowEnd: tt.windowEnd + seconds,
    routes: tt.routes.map((r) => ({ ...r, trips: r.trips.map((t) => t.map((x) => x + seconds)) })),
  };
}
