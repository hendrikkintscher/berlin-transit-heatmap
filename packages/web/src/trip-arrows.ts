// Which way a trip goes (roadmap 1.1/1.2, Hendrik picked look C in line colours): one small
// arrowhead in the middle of each ride, in its line's colour; walks and bike legs get none. The ends carry "Start" and "Ziel" labels and the end point is as big as the start
// (style.css).

import type maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { MODE_COLORS } from './colors';

const ARROW_SOURCE = 'trip-arrows';
/** The arrowhead's size in px. */
const ARROW_PX = 20;

type Coord = [number, number];

/** Rough metres between two lon/lat points (fine at city scale). */
function metres(a: Coord, b: Coord): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111_320;
}

/** The point `share` of the way along a line, and the compass bearing there (degrees). */
export function pointAlong(line: Coord[], share: number): { at: Coord; bearing: number } | null {
  if (line.length < 2) return null;
  const lengths = line.slice(1).map((p, i) => metres(line[i]!, p));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let left = total * share;
  for (const [i, len] of lengths.entries()) {
    if (len === 0) continue;
    if (left <= len || i === lengths.length - 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const f = Math.min(1, left / len);
      const k = Math.cos((a[1] * Math.PI) / 180);
      const bearing = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
      return { at: [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])], bearing };
    }
    left -= len;
  }
  return null;
}

/** An arrowhead pointing right (a line's direction), filled `fill`, with a white edge. */
function arrowImage(fill: string, size: number) {
  const ratio = 2;
  const px = size * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  g.scale(ratio, ratio);
  g.beginPath();
  g.moveTo(size * 0.2, size * 0.18);
  g.lineTo(size * 0.86, size * 0.5);
  g.lineTo(size * 0.2, size * 0.82);
  g.lineTo(size * 0.36, size * 0.5);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 2.5;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  const data = g.getImageData(0, 0, px, px);
  return { image: { width: px, height: px, data: new Uint8Array(data.data.buffer) }, ratio };
}

/** Where a ride's arrow goes: halfway along it. */
export const arrowAt = (line: Coord[]) => pointAlong(line, 0.5);

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Adds the arrows' layer above the trip's lines (after addMapLayers); `show` draws them for
 * the trip's lines (null: none).
 */
export function addTripArrows(map: maplibregl.Map) {
  const colours: Record<string, string> = { ...MODE_COLORS, other: '#444444' };
  for (const [mode, colour] of Object.entries(colours)) {
    const a = arrowImage(colour, ARROW_PX);
    map.addImage(`trip-arrow-${mode}`, a.image, { pixelRatio: a.ratio });
  }
  map.addSource(ARROW_SOURCE, { type: 'geojson', data: empty });
  map.addLayer(
    {
      id: 'trip-arrows',
      type: 'symbol',
      source: ARROW_SOURCE,
      layout: {
        'icon-image': [
          'match',
          ['get', 'mode'],
          Object.keys(colours),
          ['concat', 'trip-arrow-', ['get', 'mode']],
          'trip-arrow-other',
        ] as unknown as maplibregl.ExpressionSpecification,
        // The icon points east; a bearing counts from north.
        'icon-rotate': ['-', ['get', 'bearing'], 90] as maplibregl.ExpressionSpecification,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    'trip-stops',
  );
  return (lines: GeoJSON.FeatureCollection | null) => {
    const features: GeoJSON.Feature[] = [];
    for (const f of lines?.features ?? []) {
      if (f.geometry.type !== 'LineString' || f.properties?.walk) continue;
      const at = arrowAt(f.geometry.coordinates as Coord[]);
      if (at)
        features.push({
          type: 'Feature',
          properties: { mode: f.properties?.mode, bearing: at.bearing },
          geometry: { type: 'Point', coordinates: at.at },
        });
    }
    (map.getSource(ARROW_SOURCE) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  };
}
