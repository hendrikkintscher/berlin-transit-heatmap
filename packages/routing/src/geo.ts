/** Walking speed in metres per second, as fixed by the plan. */
export const WALK_SPEED_MPS = 1.2;

/** Metres per degree of latitude (mean). */
export const M_PER_DEG_LAT = 111_320;

/** Metres per degree of longitude at the given latitude. */
export function metresPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * A local equirectangular projection to metres. Accurate to well under 1 %
 * over the extent of Berlin, which is plenty for walking distances.
 */
export interface LocalProjection {
  lat0: number;
  lon0: number;
  mPerLat: number;
  mPerLon: number;
}

export function makeProjection(lat0: number, lon0: number): LocalProjection {
  return { lat0, lon0, mPerLat: M_PER_DEG_LAT, mPerLon: metresPerDegLon(lat0) };
}

/** Straight-line distance in metres (equirectangular approximation). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lon2 - lon1) * metresPerDegLon((lat1 + lat2) / 2);
  return Math.sqrt(dx * dx + dy * dy);
}
