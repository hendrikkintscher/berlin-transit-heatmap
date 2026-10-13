// The timetable file format produced by this package and read by `packages/routing`:
// change both together.

export type Mode = 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'ferry' | 'regional' | 'other';

/** "day" (10–12) and "night" (02–04) on a weekday, or an hourly window such as "weekday-10" / "weekend-02". */
export type WindowName = string;

/** Weekday = a Tuesday–Thursday; weekend = the following Saturday (00–04 is Friday night). */
export type DayType = 'weekday' | 'weekend';

export interface Timetable {
  version: 1;
  window: WindowName;
  /** YYYY-MM-DD, the reference day used (a weekday, or the Saturday for weekend windows). */
  serviceDate: string;
  /** Seconds since midnight of serviceDate, e.g. 36000 for 10:00. */
  windowStart: number;
  windowEnd: number;
  feedVersion: string;
  /** Index = stop id used everywhere below. Identical in both windows. */
  stops: Stop[];
  /** RAPTOR routes: trips with an identical stop sequence that never overtake each other. */
  routes: Route[];
  /** Footpaths between stops; both directions present. */
  transfers: Transfer[];
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Index of the parent station in `stops`, if any. Station entries themselves have no routes. */
  parent?: number;
  /**
   * false: the platform can only be reached by stairs or escalators (from the feed's
   * pathways). Absent: step-free, or no information (street stops).
   */
  stepFree?: false;
}

export interface Route {
  name: string;
  mode: Mode;
  /** Stop indices in travel order. */
  stops: number[];
  /** trips[t][i] = departure time (seconds) at stops[i]. Sorted by first departure. */
  trips: number[][];
  /** dwells[t][i] = seconds waited at stops[i] (arrival = departure - dwell). Absent: all 0. */
  dwells?: number[][];
  /** false: the trips are not marked wheelchair-accessible. Absent: they are (or the feed does not say). */
  stepFree?: false;
}

export interface Transfer {
  from: number;
  to: number;
  seconds: number;
}

/** `stops.json`: the stop list shared by both window files, for clients that want metadata only. */
export interface StopsFile {
  version: 1;
  serviceDate: string;
  feedVersion: string;
  stops: Stop[];
}
