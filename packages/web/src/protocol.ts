// Messages between the UI thread (main.ts) and the routing worker (worker.ts).
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { ContourProps } from './contours';
import type { MeetSuggestion } from './meet';

/** A timetable window, e.g. "weekday-10" (see when.ts). */
export type Window = string;
export type Direction = 'depart' | 'arrive';
export type Measure = 'typical' | 'best' | 'next';
/** How people get around: walking to and from stops, cycling instead, or cycling all the way. */
export type Travel = 'walk' | 'bike' | 'bikeonly';

/** One leg of the journey shown for a tapped spot, in travel order. */
export type TripLeg =
  | { type: 'walk'; minutes: number; bike?: true }
  | {
      type: 'ride';
      name: string;
      mode: string;
      from: string;
      to: string;
      stops: number;
      /** When the vehicle leaves `from` and reaches `to`, seconds of the day. */
      dep?: number;
      arr?: number;
      /** The stops in between, with the vehicle's departure there. */
      passed?: { name: string; at: number }[];
    };

export type ToWorker =
  /** v: the data files' versions from the start page (data-url.ts). */
  | { type: 'init'; dataBase: string; v?: string }
  /**
   * Sent by the start page's inline script before the app's code has loaded: the page's
   * address and stored settings, so the worker sets itself up, prepares the first map's
   * timetable and draws that map at once (earlyLoad in early.ts, mapAhead in worker.ts).
   */
  | {
      type: 'boot';
      baseURI: string;
      v?: string;
      search: string;
      /** The device settings the app's state starts from (STATE_KEYS in early.ts). */
      stored: Record<string, string | null>;
      /** When the page opened (ms since 1970): the first map leaves then, on Nächste. */
      at: number;
    }
  | {
      type: 'load';
      window: Window;
      /** A background load (the next hour): failures stay silent. */
      quiet?: boolean;
      /** Prepare it as a compute with these settings will need it. */
      direction?: Direction;
      stepFree?: boolean;
      bike?: boolean;
    }
  | {
      type: 'compute';
      id: number;
      /** Timetable file; for 'arrive' the hour before the arrival hour (see when.ts). */
      window: Window;
      lat: number;
      lon: number;
      /** Meeting point: the other starts (up to four); the map then shows the slowest trip. */
      others?: { lat: number; lon: number }[];
      /** 'depart': from the point leaving in the hour; 'arrive': to the point arriving in the hour after the file's window. */
      direction: Direction;
      /**
       * 'typical' averages over the hour, waiting included; 'best' is the shortest trip in
       * it; 'next' takes the next connection (departing: from leaveOffset seconds into the
       * hour; arriving: the last one arriving on the hour, or arriveOffset after it).
       */
      measure: Measure;
      /** Seconds into the hour it is now (0 for another hour); trips on tap leave then. */
      leaveOffset?: number;
      /** Arriving at an exact time: seconds after the full hour to arrive by. */
      arriveOffset?: number;
      /** Compare: a second timetable file; the map then shows how much longer trips take there. */
      compare?: Window;
      /** Walking speed in km/h (menu setting). */
      walkKmh: number;
      /** Step-free: only accessible trips and platforms with a lift or ramp. */
      stepFree?: boolean;
      /** Cycling to and from stations, or all the way (default walking). */
      travel?: Travel;
      /**
       * The Heatmap switch is off: skip the colour image (the result comes back `unpainted`)
       * so the outlines arrive sooner; a 'paint' draws it once the switch goes on.
       */
      noImage?: true;
      /** "Bis N Min.": the image shades what is reachable within this many minutes instead. */
      limit?: number;
    }
  /**
   * The colour image of the map computed as `id` (the last one), skipped with `noImage`, or
   * with `limit` its "Bis N Min." shading.
   */
  | { type: 'paint'; id: number; limit?: number }
  /** The journey to a tapped place; `leaveAt` (seconds of the day) when the shown one was missed. */
  | { type: 'trip'; id: number; lat: number; lon: number; leaveAt?: number }
  /**
   * The connections after the shown one (arriving: before it), which left at `leave` and
   * arrives at `arrive`, to the same place; for the drawer.
   */
  | { type: 'moreTrips'; id: number; lat: number; lon: number; leave: number; arrive: number }
  /** The nearest stop's name, to name a place ("bei S Südkreuz"). */
  | { type: 'placeName'; id: number; lat: number; lon: number }
  | { type: 'layers'; window: Window; thresholds: readonly [number, number]; walkKmh: number }
  /** Station names and places for search suggestions, from the loaded timetable. */
  | { type: 'stations'; window: Window }
  /** Fetch the footpath network now (the first map is on screen, or there is none to wait for). */
  | { type: 'loadWalk' }
  /**
   * "Where can I live?": one Typisch pass arriving at each favourite place, combined into
   * the weighted average per cell (see favourites.ts). Answered with progress and a result
   * marked `living`.
   */
  | {
      type: 'living';
      id: number;
      /** Arriving in the chosen hour: the hour before it, as for 'arrive' (see when.ts). */
      window: Window;
      places: { lat: number; lon: number; weight: number }[];
      walkKmh: number;
      stepFree?: boolean;
      travel?: Travel;
    }
  /** Minutes from a place to each favourite on the "where can I live?" map with id `map`. */
  | { type: 'livingAt'; id: number; map: number; lat: number; lon: number }
  /**
   * "Bis wann komme ich heim?": RAPTOR passes arriving at the point every 15 minutes
   * through the evening and night, one hourly file after the other. Answered with
   * progress and a result carrying `home`.
   */
  | {
      type: 'home';
      id: number;
      /** The evening and night files in time order (20 Uhr to 1 Uhr). */
      windows: Window[];
      lat: number;
      lon: number;
      walkKmh: number;
      stepFree?: boolean;
      travel?: Travel;
    }
  /** The last fast connection home from a place on the home map `map`; answered as a 'trip'. */
  | { type: 'homeTrip'; id: number; map: number; lat: number; lon: number };

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

/** A station for search suggestions. */
export interface SearchStation {
  name: string;
  lat: number;
  lon: number;
  /** Up to eight line names, e.g. "S5, S7, U2". */
  lines: string;
  perHour: number;
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
  /** The footpath network is on its way: `loaded` of `total` bytes (0 when unknown). */
  | { type: 'walkProgress'; loaded: number; total: number }
  /** The footpath network has arrived: maps computed so far used straight-line walks. */
  | { type: 'walk' }
  /** The footpath network could not be loaded: walks stay straight lines. */
  | { type: 'walkFailed' }
  /** A map computed in steps (where-to-live, the way home): `done` of `total` are in. */
  | { type: 'mapProgress'; id: number; done: number; total: number }
  | { type: 'livingAt'; id: number; minutes: (number | null)[] }
  | {
      type: 'result';
      id: number;
      window: Window;
      /**
       * Travel-time raster, drawn as an image: RGBA pixels, rows evenly spaced in Web Mercator.
       * Over its own `bbox` when it covers only part of the grid ("Bis N Min.").
       */
      image: {
        width: number;
        height: number;
        rgba: Uint8ClampedArray<ArrayBuffer>;
        bbox?: [number, number, number, number];
      };
      /** [west, south, east, north] of the image and the grid. */
      bbox: [number, number, number, number];
      /** Grid travel times for the tap readout (row 0 = north, rows evenly spaced in latitude). */
      grid: { cols: number; rows: number; seconds: Float32Array<ArrayBuffer> };
      /** Meeting point: each start's own times on the same grid (the map shows their max). */
      each?: Float32Array<ArrayBuffer>[];
      /** Meeting point: up to three suggested meeting points, best first. */
      meet?: MeetSuggestion[];
      /**
       * Meeting point (not comparing): the smallest slowest-of-all time on the grid.
       * The image and outlines show extra minutes over it; `grid` keeps the actual times.
       */
      extraBase?: number;
      /** "Where can I live?": `grid` holds the weighted average to the favourites, not trip times. */
      living?: true;
      /** The where-to-live map's best spots, best first, at least 1.5 km apart. */
      best?: { lat: number; lon: number; seconds: number }[];
      /**
       * "Bis wann komme ich heim?": `grid` holds, per place, how long before `end` (seconds
       * after midnight of the evening, past 24 h) the last fast connection home leaves;
       * `any` the same for the last connection at all, night network included.
       */
      home?: { end: number; any: Float32Array<ArrayBuffer> };
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
      /** Asked with `noImage`: `image` is empty until a 'paint' brings it. */
      unpainted?: true;
      /** The image is the "Bis N Min." shading for this many minutes, not the colours. */
      limit?: number;
    }
  | {
      type: 'image';
      id: number;
      image: {
        width: number;
        height: number;
        rgba: Uint8ClampedArray<ArrayBuffer>;
        bbox?: [number, number, number, number];
      };
      /** Painted as "Bis N Min." for this many minutes. */
      limit?: number;
    }
  | { type: 'stations'; list: SearchStation[] }
  /**
   * More connections for the drawer, each drawn as a trip would be; the same `id` may come
   * again with a longer list (connections on other lines, found one search at a time).
   */
  | {
      type: 'moreTrips';
      id: number;
      trips: Omit<Extract<FromWorker, { type: 'trip' }>, 'type' | 'id'>[];
    }
  /** The nearest stop's name (null: none close or no timetable yet). */
  | { type: 'placeName'; id: number; name: string | null }
  /** The map `id`'s lines again, now along the real tracks and roads (lines.bin arrived). */
  | {
      type: 'routes';
      id: number;
      routes: FeatureCollection<LineString, RouteProps>;
      labels: FeatureCollection<LineString, { names: string }>;
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
      /** One journey per start (more with a meeting point); null where unreachable. */
      journeys: ({
        legs: TripLeg[];
        transfers: number;
        /**
         * Under Typisch and Bestfall: the minutes of this connection, which leaves now
         * (arriving: arrives by the end of the hour). Under Nächste the map's own minutes.
         */
        minutes?: number;
        /** When to leave the start and when it arrives, seconds of the service day. */
        leave?: number;
        arrive?: number;
        /** Departing: the first vehicle (stop index, line, planned departure in seconds of the day). */
        board?: { stop: number; line: string; at: number };
        /** The stops nearest the journey's start and end, to name them. */
        ends?: [string | null, string | null];
      } | null)[];
      /** The journeys drawn on the map: rides coloured by mode, walks dashed. */
      lines: FeatureCollection<LineString, { mode: string; walk: boolean }>;
      /** Where rides start and end; `end` marks getting on first and off last (not a change). */
      stops: FeatureCollection<Point, { name: string; mode: string; end: boolean }>;
    }
  | { type: 'error'; message: string };
