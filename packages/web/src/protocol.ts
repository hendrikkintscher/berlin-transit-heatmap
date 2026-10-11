// Messages between the UI thread (main.ts) and the routing worker (worker.ts).
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { ContourProps } from './contours';

/** A timetable window, e.g. "weekday-10" (see when.ts). */
export type Window = string;
export type Direction = 'depart' | 'arrive';
export type Measure = 'typical' | 'best';

/** One leg of the journey shown for a tapped spot, in travel order. */
export type TripLeg =
  | { type: 'walk'; minutes: number }
  | { type: 'ride'; name: string; mode: string; from: string; to: string; stops: number };

export type ToWorker =
  | { type: 'init'; dataBase: string }
  | { type: 'load'; window: Window; quiet?: boolean }
  | {
      type: 'compute';
      id: number;
      /** Timetable file; for 'arrive' the hour before the arrival hour (see when.ts). */
      window: Window;
      lat: number;
      lon: number;
      /** Meeting point: a second start; the map then shows the slower of the two trips. */
      second?: { lat: number; lon: number };
      /** 'depart': from the point leaving in the hour; 'arrive': to the point arriving in the hour after the file's window. */
      direction: Direction;
      /** 'typical' averages over the hour, waiting included; 'best' is the shortest trip in it. */
      measure: Measure;
      /** Compare: a second timetable file; the map then shows how much longer trips take there. */
      compare?: Window;
    }
  | { type: 'trip'; id: number; lat: number; lon: number }
  | { type: 'layers'; window: Window; thresholds: readonly [number, number] };

export interface TimetableInfo {
  window: Window;
  serviceDate: string;
  feedVersion: string;
  stops: number;
}

export interface RouteProps {
  /** Share of the reachable map whose fastest journey rides this hop (0..1). */
  share: number;
  mode: string;
  /** Line names, heaviest first, joined with "/". */
  names: string;
}

export interface StationProps {
  name: string;
  /** Departures per hour in the window, all platforms and directions together. */
  perHour: number;
  /** Up to eight line names, S/U/Metro first, joined with ", ". */
  lines: string;
}

/** A grid drawn as an image over [west, south, east, north], with its raw values for taps. */
export interface RasterLayer {
  image: { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> };
  bbox: [number, number, number, number];
  grid: { cols: number; rows: number; seconds: Float32Array<ArrayBuffer> };
}

export type FromWorker =
  | { type: 'progress'; window: Window; loaded: number; total: number }
  | { type: 'loaded'; info: TimetableInfo }
  | {
      type: 'result';
      id: number;
      window: Window;
      /** Travel-time raster, drawn as an image: RGBA pixels, rows evenly spaced in Web Mercator. */
      image: { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> };
      /** [west, south, east, north] of the image and the grid. */
      bbox: [number, number, number, number];
      /** Grid travel times for the tap readout (row 0 = north, rows evenly spaced in latitude). */
      grid: { cols: number; rows: number; seconds: Float32Array<ArrayBuffer> };
      /** With a second start: each start's own times on the same grid (the map shows their max). */
      each?: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
      /** When comparing: times at the second time on the same grid; the image shows the difference. */
      compare?: Float32Array<ArrayBuffer>;
      /** Network hops the fastest journeys rely on, with share of reachable map. */
      routes: FeatureCollection<LineString, RouteProps>;
      /** The busier hops chained into longer lines per name set, for labels. */
      labels: FeatureCollection<LineString, { names: string }>;
      /** Isochrone outlines every 5 minutes up to an hour. */
      outlines: FeatureCollection<LineString, ContourProps>;
      computedInMs: number;
      totalMs: number;
    }
  | {
      type: 'layers';
      window: Window;
      stations: FeatureCollection<Point, StationProps>;
      /** Access time (walk to a stop + half the average gap between departures), shaded. */
      desert: RasterLayer;
    }
  | {
      type: 'trip';
      id: number;
      /** One journey per start (two with a meeting point); null where unreachable. */
      journeys: ({ legs: TripLeg[]; transfers: number } | null)[];
      /** The journeys drawn on the map: rides coloured by mode, walks dashed. */
      lines: FeatureCollection<LineString, { mode: string; walk: boolean }>;
    }
  | { type: 'error'; message: string };
