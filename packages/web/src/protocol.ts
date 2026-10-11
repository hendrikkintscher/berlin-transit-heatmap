// Messages between the UI thread (main.ts) and the routing worker (worker.ts).
import type { FeatureCollection, LineString } from 'geojson';

export type Window = 'day' | 'night';

export type ToWorker =
  | { type: 'init'; dataBase: string }
  | { type: 'load'; window: Window; quiet?: boolean }
  | { type: 'compute'; id: number; window: Window; lat: number; lon: number };

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
      /** Network hops the fastest journeys rely on, with share of reachable map. */
      routes: FeatureCollection<LineString, RouteProps>;
      /** The busier hops chained into longer lines per name set, for labels. */
      labels: FeatureCollection<LineString, { names: string }>;
      computedInMs: number;
      totalMs: number;
    }
  | { type: 'error'; message: string };
