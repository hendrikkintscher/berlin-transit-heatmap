import { REGION, type Box } from '../../routing/src/regions.ts';

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** A region box ([minLon, minLat, maxLon, maxLat]) as a BBox. */
export function toBBox([minLon, minLat, maxLon, maxLat]: Box): BBox {
  return { minLon, minLat, maxLon, maxLat };
}

/** The stops kept: the router's grid area plus a margin (Contract 1), from the region. */
export const STOP_BBOX: BBox = toBBox(REGION.stopBbox);

export function inBBox(bbox: BBox, lat: number, lon: number): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Calls `onPair(i, j, metres)` for every unordered pair of points closer than
 * `radiusM`, using a uniform grid so the cost stays near-linear.
 */
export function forEachNearbyPair(
  points: { lat: number; lon: number }[],
  radiusM: number,
  onPair: (i: number, j: number, metres: number) => void,
): void {
  if (points.length === 0) return;
  const refLat = points[0]!.lat;
  const cellLat = radiusM / 111_320;
  const cellLon = radiusM / (111_320 * Math.cos(refLat * RAD));
  const grid = new Map<string, number[]>();
  const keyOf = (x: number, y: number) => `${x},${y}`;
  points.forEach((p, i) => {
    const key = keyOf(Math.floor(p.lon / cellLon), Math.floor(p.lat / cellLat));
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  });
  points.forEach((p, i) => {
    const x = Math.floor(p.lon / cellLon);
    const y = Math.floor(p.lat / cellLat);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(keyOf(x + dx, y + dy)) ?? []) {
          if (j <= i) continue;
          const q = points[j]!;
          const d = distanceM(p.lat, p.lon, q.lat, q.lon);
          if (d <= radiusM) onPair(i, j, d);
        }
      }
    }
  });
}
