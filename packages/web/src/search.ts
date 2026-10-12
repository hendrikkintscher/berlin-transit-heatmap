// Address search via Photon (https://photon.komoot.io), a free OpenStreetMap geocoder.
// Results are limited to the area the heatmap covers.
import { DEFAULT_BBOX } from '@berlin-transit-heatmap/routing';

const ENDPOINT = 'https://photon.komoot.io/api/';
/** west, south, east, north: the heatmap grid's area (Berlin and the commuter belt). */
export const SEARCH_BBOX = DEFAULT_BBOX;
/** A house number in a query ("Torstraße 12a"); a five-digit postcode is not one. */
const HOUSE_NUMBER = /(^|\s)\d{1,4}[a-z]?(\s|,|$)/i;

export interface Place {
  label: string;
  detail: string;
  lat: number;
  lon: number;
  /** A street (not one house): picking it goes on to its house numbers. */
  street?: { name: string; postcode?: string };
}

interface PhotonProps {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  district?: string;
  locality?: string;
  city?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
}
interface PhotonFeature {
  properties: PhotonProps;
  geometry: { coordinates: [number, number] };
}

/**
 * Turns Photon features into short, de-duplicated suggestion rows. When the query has a house
 * number, the plain address comes first and shops or offices at the same address are dropped.
 */
export function toPlaces(features: PhotonFeature[], query = ''): Place[] {
  // Photon's bbox is a hint for its ranking as much as a filter, so check each point again.
  const [w, so, e, n] = SEARCH_BBOX;
  features = features.filter(
    ({
      geometry: {
        coordinates: [lon, lat],
      },
    }) => {
      return lon >= w && lon <= e && lat >= so && lat <= n;
    },
  );
  if (HOUSE_NUMBER.test(query)) {
    const plain = (f: PhotonFeature) => !f.properties.name && !!f.properties.housenumber;
    const addr = (f: PhotonFeature) =>
      `${f.properties.street}|${f.properties.housenumber}|${f.properties.postcode}`;
    const known = new Set(features.filter(plain).map(addr));
    features = [
      ...features.filter(plain),
      ...features.filter((f) => !plain(f) && !known.has(addr(f))),
    ];
  }
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of features) {
    const p = f.properties;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const label = p.name ?? street;
    if (!label) continue;
    const area = p.district ?? p.locality ?? (p.city !== 'Berlin' ? p.city : undefined);
    const where = [p.postcode, area].filter(Boolean).join(' ');
    const detail = [
      street !== label ? street : '',
      where,
      p.city && p.city !== area && p.city !== 'Berlin' ? p.city : '',
    ]
      .filter(Boolean)
      .join(', ');
    const key = `${label}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lon, lat] = f.geometry.coordinates;
    const isStreet = p.type === 'street' && p.osm_key === 'highway' && !!p.name;
    out.push(
      isStreet
        ? { label, detail, lat, lon, street: { name: p.name!, postcode: p.postcode } }
        : { label, detail, lat, lon },
    );
  }
  return out;
}

/**
 * The houses of a picked street that match the typed number, in its postcode (or, without
 * one, near the street's point `at`): the second step of the staged address search (street,
 * then house number).
 */
export function streetHouses(
  places: Place[],
  street: { name: string; postcode?: string },
  at?: { lat: number; lon: number },
): Place[] {
  return places.filter(
    (p) =>
      !p.street &&
      p.label.startsWith(`${street.name} `) &&
      (street.postcode
        ? p.detail.includes(street.postcode)
        : !at || (Math.abs(p.lat - at.lat) < 0.02 && Math.abs(p.lon - at.lon) < 0.03)),
  );
}

export async function searchPlaces(
  query: string,
  near: { lat: number; lon: number },
  signal: AbortSignal,
  lang: 'de' | 'en' = 'de',
  layer?: 'house',
): Promise<Place[]> {
  const p = new URLSearchParams({
    q: query,
    lat: near.lat.toFixed(4),
    lon: near.lon.toFixed(4),
    bbox: SEARCH_BBOX.join(','),
    lang,
    limit: '12',
  });
  if (layer) p.set('layer', layer);
  const res = await fetch(`${ENDPOINT}?${p}`, { signal });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return toPlaces(json.features, query).slice(0, 6);
}

/** Best-effort name for a point (street and number, or a named place), via Photon's reverse lookup. */
export async function reversePlace(
  at: { lat: number; lon: number },
  lang: 'de' | 'en' = 'de',
): Promise<string | null> {
  return (await reverseAddress(at, lang))?.label ?? null;
}

/** The nearest address or named place to a point, with its own position. */
export async function reverseAddress(
  at: { lat: number; lon: number },
  lang: 'de' | 'en' = 'de',
): Promise<Place | null> {
  const p = new URLSearchParams({
    lat: at.lat.toFixed(5),
    lon: at.lon.toFixed(5),
    lang,
    limit: '1',
  });
  const res = await fetch(`https://photon.komoot.io/reverse?${p}`);
  if (!res.ok) throw new Error(`reverse lookup failed (${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return toPlaces(json.features)[0] ?? null;
}
