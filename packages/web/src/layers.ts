// Map layers that do not depend on the start point: how often each stop is served, and
// how far a place is from frequent service ("transit deserts"). Both are computed in the
// worker from the timetable already loaded for routing.
import {
  REGION,
  heatGrid,
  type HeatGrid,
  type PreparedTimetable,
  type RouteMode,
  type WalkNetwork,
} from '@berlin-transit-heatmap/routing';
import type { FeatureCollection, Point } from 'geojson';
import type { StationProps, StopProps } from './protocol';
import { STOP_MODES } from './colors';
import { stationName } from './stop-name';

/** Desert grid cell size; coarser than the heatmap, the shading is a broad-brush view. */
export const DESERT_CELL_M = 100;
/** Longest walk to a stop that still counts as access, in seconds. */
export const MAX_ACCESS_WALK_S = 900;
/** Stops of the same name closer than this are drawn as one station. */
const MERGE_M = 300;

/**
 * Departures per hour at every stop within the timetable's window. A trip's last stop
 * is an arrival only and does not count. Trips running just before or after the window
 * (kept in the file so journeys can finish) are left out.
 */
export function departuresPerHour(tt: PreparedTimetable): Float32Array {
  const counts = new Float32Array(tt.stopCount);
  for (let r = 0; r < tt.routeCount; r++) {
    const s0 = tt.routeStopOffset[r];
    const n = tt.routeStopOffset[r + 1] - s0;
    const trips = tt.routeTripCount[r];
    const base = tt.routeTimeOffset[r];
    for (let trip = 0; trip < trips; trip++) {
      const row = base + trip * n;
      for (let i = 0; i < n - 1; i++) {
        const t = tt.times[row + i];
        if (t >= tt.windowStart && t < tt.windowEnd) counts[tt.routeStops[s0 + i]]++;
      }
    }
  }
  const hours = (tt.windowEnd - tt.windowStart) / 3600;
  for (let s = 0; s < counts.length; s++) counts[s] /= hours;
  return counts;
}

interface StationGroup {
  name: string;
  /** The first platform's position, for merging by distance. */
  lat: number;
  lon: number;
  sumLat: number;
  sumLon: number;
  n: number;
}

/**
 * Merges platforms into stations: by parent stop, then stops of the same tidied name within
 * MERGE_M. Only stops that `keep` accepts take part. `of[s]` is the index in `groups` of stop
 * s's station (-1 for the rest); a station sits at the mean of its platforms.
 */
function mergeStations(
  tt: PreparedTimetable,
  keep: (s: number) => boolean,
): { groups: StationGroup[]; of: Int32Array } {
  const of = new Int32Array(tt.stopCount).fill(-1);
  const byRoot = new Map<number, number>();
  const byName = new Map<string, number[]>();
  const found: StationGroup[] = [];
  const mPerLon = tt.proj.mPerLon;
  const mPerLat = tt.proj.mPerLat;
  for (let s = 0; s < tt.stopCount; s++) {
    if (!keep(s)) continue;
    const root = tt.stops[s].parent ?? s;
    let gi = byRoot.get(root);
    if (gi === undefined) {
      const name = stationName(tt.stops[root].name);
      const lat = tt.stopLat[s];
      const lon = tt.stopLon[s];
      const same = byName.get(name) ?? [];
      gi = same.find(
        (i) => Math.hypot((found[i].lat - lat) * mPerLat, (found[i].lon - lon) * mPerLon) < MERGE_M,
      );
      if (gi === undefined) {
        gi = found.push({ name, lat, lon, sumLat: 0, sumLon: 0, n: 0 }) - 1;
        same.push(gi);
        byName.set(name, same);
      }
      byRoot.set(root, gi);
    }
    const g = found[gi];
    g.sumLat += tt.stopLat[s];
    g.sumLon += tt.stopLon[s];
    g.n++;
    of[s] = gi;
  }
  // Stations of one name next to each other, as the list has always been ordered.
  const order = [...byName.values()].flat();
  const at = new Int32Array(found.length);
  order.forEach((gi, i) => (at[gi] = i));
  for (let s = 0; s < of.length; s++) if (of[s] >= 0) of[s] = at[of[s]];
  return { groups: order.map((gi) => found[gi]), of };
}

const centre = (g: StationGroup): [number, number] => [
  round5(g.sumLon / g.n),
  round5(g.sumLat / g.n),
];

/**
 * One point per station (platforms merged) with its departures per hour over all platforms
 * and directions, and up to eight line names.
 */
export function stations(
  tt: PreparedTimetable,
  perHour: Float32Array,
): FeatureCollection<Point, StationProps> {
  // Line names serving each stop.
  const lines = new Map<number, Set<string>>();
  for (let r = 0; r < tt.routeCount; r++) {
    for (let k = tt.routeStopOffset[r]; k < tt.routeStopOffset[r + 1] - 1; k++) {
      const s = tt.routeStops[k];
      let set = lines.get(s);
      if (!set) lines.set(s, (set = new Set()));
      set.add(tt.routeNames[r]);
    }
  }
  const { groups, of } = mergeStations(tt, (s) => perHour[s] > 0);
  const sums = groups.map((g) => ({ g, perHour: 0, lines: new Set<string>() }));
  for (let s = 0; s < tt.stopCount; s++) {
    if (of[s] < 0) continue;
    const a = sums[of[s]];
    a.perHour += perHour[s];
    for (const l of lines.get(s) ?? []) a.lines.add(l);
  }
  sums.sort((a, b) => a.perHour - b.perHour);
  return {
    type: 'FeatureCollection',
    // Quietest first, so busy stations draw on top.
    features: sums.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centre(a.g) },
      properties: {
        name: a.g.name,
        perHour: Math.round(a.perHour),
        lines: [...a.lines].sort(compareLines).slice(0, 8).join(', '),
      },
    })),
  };
}

const STOP_RANK = (m: RouteMode) => {
  const k = (STOP_MODES as readonly string[]).indexOf(m);
  return k < 0 ? STOP_MODES.length - 1 : k;
};

/**
 * Every stop on the map (S032): one point per station, merged as in `stations`, with its
 * name and strongest mode `k` (the index in STOP_MODES). Unlike `stations`, a stop counts when any line in
 * the loaded timetable calls there, whatever the hour. Major stations come last, so they draw
 * on top.
 */
export function stopPoints(tt: PreparedTimetable): FeatureCollection<Point, StopProps> {
  const rank = new Uint8Array(tt.stopCount).fill(255);
  for (let r = 0; r < tt.routeCount; r++) {
    const k = STOP_RANK(tt.routeModes[r]);
    for (let i = tt.routeStopOffset[r]; i < tt.routeStopOffset[r + 1]; i++) {
      const s = tt.routeStops[i];
      if (k < rank[s]) rank[s] = k;
    }
  }
  const { groups, of } = mergeStations(tt, (s) => rank[s] !== 255);
  const hubs: Record<string, string | undefined> = REGION.hubs;
  const best = new Uint8Array(groups.length).fill(255);
  for (let s = 0; s < tt.stopCount; s++)
    if (of[s] >= 0 && rank[s] < best[of[s]]) best[of[s]] = rank[s];
  const features = groups.map((g, i) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: centre(g) },
    properties: { name: g.name, k: best[i], ...(hubs[g.name] ? { h: hubs[g.name] } : {}) },
  }));
  features.sort((a, b) => b.properties.k - a.properties.k);
  return { type: 'FeatureCollection', features };
}

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
const LINE_ORDER = ['S', 'U', 'M', 'R'];
/** S-Bahn, U-Bahn and Metro lines first, then the rest, numbers in natural order. */
function compareLines(a: string, b: string): number {
  const rank = (x: string) => {
    const i = LINE_ORDER.indexOf(x[0]);
    return i < 0 ? LINE_ORDER.length : i;
  };
  return rank(a) - rank(b) || a.localeCompare(b, 'de', { numeric: true });
}

/**
 * Access time per cell: the best walk to a stop plus half the average gap between its
 * departures (the expected wait when you turn up at a random time). Each platform counts
 * on its own, since platforms are mostly one direction each. Infinity = no stop with
 * service within a 15-minute walk.
 */
export function accessGrid(
  tt: PreparedTimetable,
  perHour: Float32Array,
  walk?: WalkNetwork,
  walkSpeedMps?: number,
): HeatGrid {
  const waitSeconds = new Float32Array(tt.stopCount);
  for (let s = 0; s < tt.stopCount; s++) {
    waitSeconds[s] = perHour[s] > 0 ? 1800 / perHour[s] : Infinity;
  }
  return heatGrid(
    tt,
    { stopSeconds: waitSeconds, computedInMs: 0 },
    {
      cellSizeM: DESERT_CELL_M,
      maxFinalWalkSeconds: MAX_ACCESS_WALK_S,
      maxFallbackWalkSeconds: MAX_ACCESS_WALK_S,
      walk,
      walkSpeedMps,
    },
  );
}

/** 0 = served, 1 = poorly served, 2 = very poorly served (or no stop within 15 min). */
export function desertLevel(
  seconds: number,
  [light, strong]: readonly [number, number],
): 0 | 1 | 2 {
  if (seconds > strong) return 2;
  return seconds > light ? 1 : 0;
}
