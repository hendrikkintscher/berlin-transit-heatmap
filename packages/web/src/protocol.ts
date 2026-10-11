// Messages between the UI thread (main.ts) and the routing worker (worker.ts).
import type { FeatureCollection, Polygon } from 'geojson';

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

export type FromWorker =
  | { type: 'progress'; window: Window; loaded: number; total: number }
  | { type: 'loaded'; info: TimetableInfo }
  | {
      type: 'result';
      id: number;
      window: Window;
      geojson: FeatureCollection<Polygon>;
      computedInMs: number;
      totalMs: number;
    }
  | { type: 'error'; message: string };
