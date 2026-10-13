// Everything that ties the app to one region: its area, map start, names, data sources and
// region-only extras. Berlin is the only region for now; a second one is another entry here
// (plan/regions.md). No imports, so the build scripts and workflows can read it with plain
// Node (scripts/region.mjs).

/** [minLon, minLat, maxLon, maxLat]. */
export type Box = [number, number, number, number];

export interface Region {
  /** Short id: the data folder (data/<id>/) and the prefix of what the phone stores. */
  id: string;
  /** The app's name in the region, and its tagline. */
  title: { de: string; en: string };
  tagline: { de: string; en: string };
  /** The heatmap grid's area; search results are kept inside it too. */
  bbox: Box;
  /** Stops kept by the timetable build: the grid plus a margin. */
  stopBbox: Box;
  /** Footpaths kept by the timetable build: the grid plus more than a 15-minute walk. */
  walkBbox: Box;
  /** Cut from the OpenStreetMap extracts by the monthly footpath refresh. */
  osmBbox: Box;
  /** The town the feed adds to stop names ("U Hermannplatz (Berlin)"), dropped for display. */
  town: string;
  /** Where the map opens: [lon, lat]. */
  center: [number, number];
  /** The GTFS feed the timetables are built from. */
  gtfsUrl: string;
  /** Geofabrik extracts (europe/germany/<name>) merged for the footpaths. */
  osmExtracts: string[];
  /** Ringbahn, Bezirke and landmarks on the map (orientation.ts). */
  orientation: boolean;
  /** Live delays from the region's journey API (live.ts); null when there is none. */
  liveApi: string | null;
}

export const REGIONS = {
  berlin: {
    id: 'berlin',
    title: { de: 'Wohin jetzt?', en: 'Wohin jetzt?' },
    tagline: { de: 'Öffis mit einem Tap', en: 'Transit in one tap' },
    // Berlin, Potsdam and the commuter belt (Werder, Oranienburg, Bernau, Strausberg,
    // Erkner, Königs Wusterhausen).
    bbox: [12.9, 52.27, 13.92, 52.8],
    stopBbox: [12.87, 52.25, 13.95, 52.82],
    walkBbox: [12.88, 52.26, 13.94, 52.81],
    osmBbox: [12.8, 52.2, 14.0, 52.85],
    town: 'Berlin',
    center: [13.405, 52.515],
    gtfsUrl: 'https://www.vbb.de/vbbgtfs',
    osmExtracts: ['berlin', 'brandenburg'],
    orientation: true,
    liveApi: 'https://v6.vbb.transport.rest',
  },
} satisfies Record<string, Region>;

/** The region this build serves. Only Berlin until the region addresses exist. */
export const REGION: Region = REGIONS.berlin;
