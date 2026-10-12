import type { Timetable } from './types';

/**
 * The timetable run backwards in time, for "arrive by" maps: every route reversed,
 * every time negated, footpaths flipped. Forward routing on it from a destination
 * gives, per stop, the shortest journey *to* that destination: leaving a stop at
 * -t' and arriving at -d' in real time. The window becomes the arrival window
 * [arriveFrom, arriveTo], negated. A stop's arrival becomes its departure and the
 * other way round, so the dwells stay as they are.
 */
export function reverseTimetable(tt: Timetable, arriveFrom: number, arriveTo: number): Timetable {
  return {
    ...tt,
    windowStart: -arriveTo,
    windowEnd: -arriveFrom,
    routes: tt.routes.map((r) => {
      const trips = r.trips.map((trip, t) => {
        const dwell = r.dwells?.[t];
        return {
          times: trip.map((x, i) => -(x - (dwell?.[i] ?? 0))).reverse(),
          dwell: dwell && [...dwell].reverse(),
        };
      });
      trips.sort((a, b) => a.times[0] - b.times[0]);
      return {
        ...r,
        stops: [...r.stops].reverse(),
        trips: trips.map((x) => x.times),
        ...(r.dwells ? { dwells: trips.map((x) => x.dwell!) } : {}),
      };
    }),
    transfers: tt.transfers.map((t) => ({ from: t.to, to: t.from, seconds: t.seconds })),
  };
}
