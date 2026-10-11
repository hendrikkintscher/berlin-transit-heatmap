import type { Timetable } from './types';

/** Cycling speed on the street network, about 15 km/h. */
export const BIKE_SPEED_MPS = 15 / 3.6;
/**
 * Taking the bike into a station or out of it (to the platform and on board, or
 * locking it up), at each end of the ride, in seconds.
 */
export const BIKE_STATION_SECONDS = 120;
/** A bike-only map reaches this far, in seconds of cycling. */
export const BIKE_ONLY_MAX_SECONDS = 3600;

/**
 * The timetable with a bike along: Berlin's buses do not take bikes, while S-Bahn,
 * U-Bahn, trams, regional trains and ferries do. Stop indices are unchanged.
 */
export function bikeTimetable(tt: Timetable): Timetable {
  return { ...tt, routes: tt.routes.filter((r) => r.mode !== 'bus') };
}
