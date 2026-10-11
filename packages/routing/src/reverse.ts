import type { Timetable } from './types';

/**
 * The timetable run backwards in time, for "arrive by" maps: every route reversed,
 * every time negated, footpaths flipped. Forward routing on it from a destination
 * gives, per stop, the shortest journey *to* that destination: leaving a stop at
 * -t' and arriving at -d' in real time. The window becomes the arrival window
 * [arriveFrom, arriveTo], negated.
 */
export function reverseTimetable(tt: Timetable, arriveFrom: number, arriveTo: number): Timetable {
  return {
    ...tt,
    windowStart: -arriveTo,
    windowEnd: -arriveFrom,
    routes: tt.routes.map((r) => ({
      ...r,
      stops: [...r.stops].reverse(),
      trips: r.trips.map((trip) => trip.map((t) => -t).reverse()).sort((a, b) => a[0] - b[0]),
    })),
    transfers: tt.transfers.map((t) => ({ from: t.to, to: t.from, seconds: t.seconds })),
  };
}
