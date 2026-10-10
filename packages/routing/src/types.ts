/**
 * Contract 1: timetable file format, as produced by `packages/timetable-build`.
 * All times are seconds since midnight of the reference service day; the night
 * window uses GTFS-style values past 24:00 (e.g. 93600 for 26:00).
 */
export interface Timetable {
  version: 1;
  window: 'day' | 'night';
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
}

export type RouteMode = 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'ferry' | 'regional' | 'other';

export interface Route {
  /** e.g. "U2", "M10", "S41", "100". */
  name: string;
  mode: RouteMode;
  /** Stop indices in travel order. */
  stops: number[];
  /** trips[t][i] = departure time at stops[i] (arrival == departure); sorted by first departure. */
  trips: number[][];
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
  /** Maximum number of transit legs. Default 6. */
  maxRounds?: number;
}

export interface TravelTimeResult {
  /** Per stop index: best travel time in seconds from the origin (Infinity if unreachable). */
  stopSeconds: Float32Array;
  computedInMs: number;
  /** The origin the result was computed for; heatGrid uses it for direct walking. (Addition to Contract 2.) */
  origin?: Origin;
  /** Number of distinct origin departure times scanned by range-RAPTOR. (Addition to Contract 2.) */
  departures?: number;
}

export interface HeatGridOptions {
  /** Cell edge length in metres. Default 250. */
  cellSizeM?: number;
  /** Maximum walk from the last stop to a cell centre, in seconds. Default 900. */
  maxFinalWalkSeconds?: number;
  /** [minLon, minLat, maxLon, maxLat]. Default DEFAULT_BBOX (Berlin). (Addition to Contract 2.) */
  bbox?: [number, number, number, number];
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
