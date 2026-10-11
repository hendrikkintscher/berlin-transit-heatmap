import type { Timetable } from './types';

/**
 * The timetable as seen with a wheelchair, pram or heavy suitcase: only trips marked
 * accessible, and no getting on or off at platforms reached only by stairs or
 * escalators. Trains still pass through those stops; footpaths to and from them are
 * dropped. Stop indices are unchanged, so walking data and stop lists still fit.
 */
export function stepFreeTimetable(tt: Timetable): Timetable {
  const ok = tt.stops.map((s) => s.stepFree !== false);
  const routes: Timetable['routes'] = [];
  for (const r of tt.routes) {
    if (r.stepFree === false) continue;
    const keep: number[] = [];
    r.stops.forEach((s, i) => {
      if (ok[s]) keep.push(i);
    });
    if (keep.length < 2) continue;
    if (keep.length === r.stops.length) routes.push(r);
    else
      routes.push({
        ...r,
        stops: keep.map((i) => r.stops[i]),
        trips: r.trips.map((trip) => keep.map((i) => trip[i])),
      });
  }
  return { ...tt, routes, transfers: tt.transfers.filter((t) => ok[t.from] && ok[t.to]) };
}
