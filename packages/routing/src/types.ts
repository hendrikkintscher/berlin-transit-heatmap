import type { WalkNetwork } from './walk';

/**
 * Contract 1: timetable file format, as produced by `packages/timetable-build`.
 * All times are seconds since midnight of the reference service day; the night
 * window uses GTFS-style values past 24:00 (e.g. 93600 for 26:00).
 */
export interface Timetable {
  version: 1;
  /** The window's name: an hour such as "weekday-10" or "20261012-10"; "day" or "night" in tests. */
  window: string;
  /** YYYY-MM-DD, the reference weekday used. */
  serviceDate: string;
  /** Seconds, e.g. 36000 for 10:00. */
  windowStart: number;
  /** Seconds, e.g. 43200 for 12:00. */
  windowEnd: number;
  feedVersion: string;
  /** Index = stop id used everywhere below. */
  stops: Stop[];
  /** A RAPTOR route: a set of trips with the identical stop sequence. */
  routes: Route[];
  /** Footpaths between stops; both directions present. */
  transfers: Transfer[];
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Index of the parent stop group, if any. */
  parent?: number;
  /** false: reached only by stairs or escalators. Absent: step-free or unknown. (Addition to Contract 1.) */
  stepFree?: false;
}

export type RouteMode = 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'ferry' | 'regional' | 'other';

export interface Route {
  /** e.g. "U2", "M10", "S41", "100". */
  name: string;
  mode: RouteMode;
  /** Stop indices in travel order. */
  stops: number[];
  /** trips[t][i] = departure time at stops[i]; sorted by first departure. */
  trips: number[][];
  /**
   * dwells[t][i] = seconds the vehicle of trip t waits at stops[i]: it arrives at
   * trips[t][i] - dwells[t][i]. Absent: arrival == departure everywhere. (Addition to Contract 1.)
   */
  dwells?: number[][];
  /** false: trips not marked wheelchair-accessible. Absent: accessible or unknown. (Addition to Contract 1.) */
  stepFree?: false;
}

export interface Transfer {
  from: number;
  to: number;
  seconds: number;
}

/** Contract 2: routing API types. */
export interface Origin {
  lat: number;
  lon: number;
}

export interface TravelTimeOptions {
  /** Maximum walk from the origin to the first stop, in seconds. Default 900. */
  maxInitialWalkSeconds?: number;
  /**
   * Longer walk allowed when no stop is within maxInitialWalkSeconds (outskirts, woods),
   * in seconds. Default twice maxInitialWalkSeconds. (Addition to Contract 2.)
   */
  maxFallbackWalkSeconds?: number;
  /**
   * Walk on this footpath network (Contract 3) instead of in a straight line. Stops
   * and origins off the network still use the straight line. (Addition to Contract 2.)
   */
  walk?: WalkNetwork;
  /**
   * Walking speed on the network in m/s (default 4 km/h); straight lines then use it
   * divided by a detour factor of 1.25. Without it straight lines keep 1.2 m/s.
   * (Addition to Contract 2.)
   */
  walkSpeedMps?: number;
  /**
   * Added to the time of every stop reached from the origin, e.g. for taking a bike
   * into the station. Not added to stops reached by riding. (Addition to Contract 2.)
   */
  accessPenaltySeconds?: number;
  /** Maximum number of transit legs. Default 6. */
  maxRounds?: number;
  /** Also record the last leg of each stop's fastest journey (result.legs). Default false. */
  trackLegs?: boolean;
  /**
   * Also compute the typical travel time (result.typicalSeconds): the average over
   * leaving at a uniformly random moment of the window, waiting included. Default false.
   */
  typical?: boolean;
  /**
   * Leave at this time (seconds since midnight of the service day, in the window)
   * instead of any time in the window: stopSeconds is then the time to each stop on the
   * next connection, waiting included. (Addition to Contract 2.)
   */
  leaveAt?: number;
  /** With `typical`, how far past the window departures are scanned, in seconds. Default 2700. */
  typicalHorizonSeconds?: number;
  /**
   * Keep no arrival later than this (seconds of the service day): stops reached only later
   * count as unreached, and the search does less. Arrivals up to it are the same as without
   * it, though of two equally quick ways the one kept may differ. (Addition to Contract 2.)
   */
  arriveBy?: number;
}

/**
 * The last leg of each stop's fastest journey, indexed by stop. Following legs
 * back from a stop gives a journey tree rooted at the origin; a parent's best
 * time is always strictly smaller, so the chain ends. (Addition to Contract 2.)
 */
export interface TravelLegs {
  /**
   * >= 0: rode prepared (sub-)route `kind` from route position `from` to `to`;
   * -1 (LEG_WALK): footpath from stop `from`; -2 (LEG_ORIGIN): walked from the
   * origin; -3 (LEG_NONE): unreachable.
   */
  kind: Int32Array;
  from: Int32Array;
  to: Int32Array;
  /**
   * Leaving at one moment (`leaveAt`), the legs of every round as well, so a journey can
   * be followed back exactly as it was ridden: a stop's own best leg may come from a later
   * round than the arrival a vehicle boarded with there. (Addition to Contract 2.)
   */
  rounds?: RoundLegs;
}

/**
 * Per-round legs, indexed `k * stopCount + stop` for round k. `kind`/`from`/`to` describe
 * how round k first reached the stop at its round-k time, as in TravelLegs; `ride*` the
 * vehicle arrival at the stop in round k that its footpaths start from (a ride only).
 */
export interface RoundLegs {
  /** Round of each stop's best leg (the `kind`/`from`/`to` above). */
  round: Uint8Array;
  kind: Int32Array;
  from: Int32Array;
  to: Int32Array;
  rideKind: Int32Array;
  rideFrom: Int32Array;
  rideTo: Int32Array;
  /** Per stop: the walk from the origin in seconds (Infinity if out of reach). */
  access: Float32Array;
  /**
   * At round * stops + stop: the arrival there (seconds of the day) when that round made
   * it earlier, else 0x3fffffff; the earliest arrival with at most k rides is the least
   * over the rounds up to k. Absent with no rides searched.
   */
  arrivals?: Int32Array;
}

export interface TravelTimeResult {
  /** Per stop index: best travel time in seconds from the origin (Infinity if unreachable). */
  stopSeconds: Float32Array;
  computedInMs: number;
  /** The origin the result was computed for; heatGrid uses it for direct walking. (Addition to Contract 2.) */
  origin?: Origin;
  /** Number of distinct origin departure times scanned by range-RAPTOR. (Addition to Contract 2.) */
  departures?: number;
  /** Present when computed with `trackLegs`. (Addition to Contract 2.) */
  legs?: TravelLegs;
  /** Present when computed with `typical`: average travel time over the window, waiting included. */
  typicalSeconds?: Float32Array;
}

export interface HeatGridOptions {
  /** Cell edge length in metres. Default 250. */
  cellSizeM?: number;
  /** Maximum walk from the last stop to a cell centre, in seconds. Default 900. */
  maxFinalWalkSeconds?: number;
  /**
   * Longer walk allowed for cells nothing reaches within maxFinalWalkSeconds, so the
   * outskirts and areas between lines are not left blank, in seconds. Default twice
   * maxFinalWalkSeconds. (Addition to Contract 2.)
   */
  maxFallbackWalkSeconds?: number;
  /** Walk on this footpath network, as in TravelTimeOptions. (Addition to Contract 2.) */
  walk?: WalkNetwork;
  /** Walking speed, as in TravelTimeOptions. (Addition to Contract 2.) */
  walkSpeedMps?: number;
  /**
   * Added to the way from every stop to a cell, e.g. for taking a bike out of the
   * station. The way straight from the origin has none. (Addition to Contract 2.)
   */
  egressPenaltySeconds?: number;
  /**
   * How far the way straight from the origin may go, in seconds, when that is
   * further than from a stop (e.g. cycling all the way). (Addition to Contract 2.)
   */
  maxOriginSeconds?: number;
  /** [minLon, minLat, maxLon, maxLat]. Default DEFAULT_BBOX (Berlin). (Addition to Contract 2.) */
  bbox?: [number, number, number, number];
  /** Also record which stop each cell's time comes from (grid.stop). Default false. (Addition to Contract 2.) */
  trackStops?: boolean;
  /**
   * Compute only these cells of the grid (first column and row, and how many of each);
   * the result is that part of the grid, with its own bbox. (Addition to Contract 2.)
   */
  window?: { c0: number; r0: number; cols: number; rows: number };
}

export interface HeatGrid {
  cellSizeM: number;
  /**
   * [minLon, minLat, maxLon, maxLat], snapped outwards to whole cells.
   * Cell (col, row) spans lon [minLon + col*dLon, minLon + (col+1)*dLon] and
   * lat [maxLat - (row+1)*dLat, maxLat - row*dLat], with dLon = (maxLon-minLon)/cols
   * and dLat = (maxLat-minLat)/rows. Row 0 is the northernmost row.
   */
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  /** Row-major (index = row * cols + col); Infinity = unreachable. */
  seconds: Float32Array;
  /** With `trackStops`: the stop each cell is reached from, -1 for walking straight from the origin or unreachable. */
  stop?: Int32Array;
}

/** Minimal GeoJSON types so the package needs no type dependencies. Structurally compatible with @types/geojson. */
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface CellProperties {
  band: number;
  seconds: number;
}

export interface GeoJSONFeature<P = CellProperties> {
  type: 'Feature';
  geometry: GeoJSONPolygon;
  properties: P;
}

export interface GeoJSONFeatureCollection<P = CellProperties> {
  type: 'FeatureCollection';
  features: GeoJSONFeature<P>[];
}
