// Map layers that do not depend on the start point: how often each stop is served, and
// how far a place is from frequent service ("transit deserts"). Both are computed in the
// worker from the timetable already loaded for routing.
import {
  heatGrid,
  type HeatGrid,
  type PreparedTimetable,
  type WalkNetwork,
} from '@berlin-transit-heatmap/routing';
import type { FeatureCollection, Point } from 'geojson';
import type { StationProps } from './protocol';

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

/** "S+U Alexanderplatz Bhf (Berlin)" -> "S+U Alexanderplatz Bhf"; drops "[...]" notes too. */
export function stationName(name: string): string {
  return (
    name
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/\s*\(Berlin\)$/, '')
      .replace(/^Berlin,\s*/, '')
      .trim() || name
  );
}

/**
 * Merges platforms into stations (by parent stop, then by name within MERGE_M) and
 * returns one point per station with its departures per hour over all platforms and
 * directions, and up to eight line names.
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
  interface Group {
    name: string;
    lat: number;
    lon: number;
    sumLat: number;
    sumLon: number;
    n: number;
    perHour: number;
    lines: Set<string>;
  }
  const byRoot = new Map<number, Group>();
  const byName = new Map<string, Group[]>();
  const mPerLon = tt.proj.mPerLon;
  const mPerLat = tt.proj.mPerLat;
  for (let s = 0; s < tt.stopCount; s++) {
    if (!(perHour[s] > 0)) continue;
    const root = tt.stops[s].parent ?? s;
    let g = byRoot.get(root);
    if (!g) {
      const name = stationName(tt.stops[root].name);
      const lat = tt.stopLat[s];
      const lon = tt.stopLon[s];
      const same = byName.get(name) ?? [];
      g = same.find((o) => Math.hypot((o.lat - lat) * mPerLat, (o.lon - lon) * mPerLon) < MERGE_M);
      if (!g) {
        g = { name, lat, lon, sumLat: 0, sumLon: 0, n: 0, perHour: 0, lines: new Set() };
        same.push(g);
        byName.set(name, same);
      }
      byRoot.set(root, g);
    }
    g.sumLat += tt.stopLat[s];
    g.sumLon += tt.stopLon[s];
    g.n++;
    g.perHour += perHour[s];
    for (const l of lines.get(s) ?? []) g.lines.add(l);
  }
  const groups = [...byName.values()].flat().sort((a, b) => a.perHour - b.perHour);
  return {
    type: 'FeatureCollection',
    // Quietest first, so busy stations draw on top.
    features: groups.map((g) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round5(g.sumLon / g.n), round5(g.sumLat / g.n)] },
      properties: {
        name: g.name,
        perHour: Math.round(g.perHour),
        lines: [...g.lines].sort(compareLines).slice(0, 8).join(', '),
      },
    })),
  };
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
