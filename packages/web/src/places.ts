// The places layer (S019): lakes, bathing spots, parks, forests and viewpoints with their minutes, to
// answer "Wohin jetzt?". The places come from the base map's own vector tiles (OpenMapTiles
// layers water_name and poi, already loaded for the map), their minutes from the map's own
// grid: no extra download and no extra routing.

export type PlaceKind = 'bathe' | 'lake' | 'park' | 'view';

export interface Place {
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
}

/** The base map's source and the tile layers the places come from. */
export const PLACE_SOURCE = 'openmaptiles';
export const PLACE_TILE_LAYERS = ['water_name', 'poi', 'park'] as const;
/**
 * Per tile layer, the classes that can be a place: the rest (shops, bollards, listed buildings …)
 * is left in the tiles, so a query hands over only what placeOf may take.
 */
export const PLACE_CLASSES: Record<(typeof PLACE_TILE_LAYERS)[number], string[]> = {
  water_name: ['lake', 'bay'],
  poi: ['swimming', 'attraction', 'park'],
  park: ['conservation', 'nature_reserve'],
};

/** Shown first when places crowd: bathing, then lakes, parks, viewpoints. */
const KIND_ORDER: PlaceKind[] = ['bathe', 'lake', 'park', 'view'];

const BATHING_NAME = /badestelle|strandbad|freibad|sommerbad|naturbad|badesee|seebad/i;
/** Protection areas named for the register rather than for a visit ("LSG Lichterfelde-Süd"). */
const REGISTER_NAME = /^(LSG|NSG|FFH|GLB)\b|schutzgebiet|schutzzone|naturdenkmal|biotop/i;

/** A tile feature as a place, or null when it is not one (or has no name). */
export function placeOf(
  layer: string,
  props: Record<string, unknown>,
  lon: number,
  lat: number,
): Place | null {
  const name = String(props['name:de'] ?? props.name ?? props.name_de ?? '').trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cls = String(props.class ?? '');
  const sub = String(props.subclass ?? '');
  let kind: PlaceKind | null = null;
  if (layer === 'water_name') kind = cls === 'lake' || cls === 'bay' ? 'lake' : null;
  else if (layer === 'poi') {
    if (cls === 'swimming' && sub !== 'swimming_pool') kind = 'bathe';
    else if (BATHING_NAME.test(name) && (cls === 'attraction' || cls === 'swimming'))
      kind = 'bathe';
    else if (cls === 'attraction' && sub === 'viewpoint') kind = 'view';
    else if (cls === 'park' && sub === 'park') kind = 'park';
  } else if (layer === 'park') {
    // Forests and nature reserves (Grunewald, Tegeler Forst …), already in the city view's
    // tiles; the layer's other areas are mostly protected buildings and gardens.
    kind =
      (cls === 'conservation' || cls === 'nature_reserve') && !REGISTER_NAME.test(name)
        ? 'park'
        : null;
  }
  return kind ? { name, kind, lat, lon } : null;
}

/**
 * Where a tile feature's label sits: a point as it is; a line (big lakes are labelled along one
 * at low zoom) at its middle vertex; an area (a forest, clipped to its tile) at the middle of its
 * outer ring's corners.
 */
export function labelPoint(g: GeoJSON.Geometry): [number, number] | null {
  if (g.type === 'Point') return g.coordinates as [number, number];
  if (g.type === 'MultiPoint') return (g.coordinates[0] as [number, number]) ?? null;
  if (g.type === 'LineString')
    return (g.coordinates[g.coordinates.length >> 1] as [number, number]) ?? null;
  const ring =
    g.type === 'Polygon'
      ? g.coordinates[0]
      : g.type === 'MultiPolygon'
        ? g.coordinates[0]?.[0]
        : null;
  if (!ring?.length) return null;
  const [x, y] = ring.reduce(([a, b], [lon, lat]) => [a + lon!, b + lat!], [0, 0]);
  return [x / ring.length, y / ring.length];
}

export interface TimedPlace extends Place {
  seconds: number;
}

/**
 * The places to show: one per name and kind (a lake's label repeats across tiles), reachable on
 * the map, at most `limit`, the kinds in order and the quickest first within each.
 */
export function pickPlaces(
  places: Place[],
  secondsAt: (lat: number, lon: number) => number,
  limit = 40,
): TimedPlace[] {
  const seen = new Set<string>();
  const out: TimedPlace[] = [];
  for (const p of places) {
    const key = `${p.kind}|${p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const seconds = secondsAt(p.lat, p.lon);
    if (seconds < Infinity) out.push({ ...p, seconds });
  }
  out.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.seconds - b.seconds,
  );
  return out.slice(0, limit);
}

/** The places as map features: the name and the minutes, rounded as the map's readout does. */
export function placesCollection(
  places: TimedPlace[],
  minLabel: string,
): GeoJSON.FeatureCollection<GeoJSON.Point, { label: string; kind: PlaceKind }> {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { label: `${p.name}\n${Math.round(p.seconds / 60)} ${minLabel}`, kind: p.kind },
    })),
  };
}
