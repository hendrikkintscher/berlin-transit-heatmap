// Trial looks for the trip on the map (roadmap 1.1), picked by the link's path=a|b|c so
// Hendrik can compare them on his phone; without it the map stays as it is. In every look
// the destination point is as big as the start (style.css, body.path-*).
//   a: pins and arrows, a dark path with a white edge and arrowheads toward the end.
//   b: flowing path, white dashes moving toward the end over the line colours; the Lines
//      layer fades while a trip shows.
//   c: Start and Ziel labels, the path shading from the accent purple to the end's colour
//      with one arrowhead near the end.

import type maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { INK } from './colors';
import { TRIP_SOURCE } from './map-layers';

export type PathLook = 'a' | 'b' | 'c';

export function pathLook(search: string): PathLook | null {
  const v = new URLSearchParams(search).get('path');
  return v === 'a' || v === 'b' || v === 'c' ? v : null;
}

const ACCENT = '#5e1f8c';
/** Look c: the end's colour, where the path's shading arrives (style.css --path-end). */
const END_COLOR = '#e8590c';
const GRADIENT_SOURCE = 'trip-gradient';
const END_ARROW_SOURCE = 'trip-end-arrow';
/** Look b: the dashes step this far (in line widths) each frame, FLOW_MS apart. */
const FLOW_DASH = 1.5;
const FLOW_GAP = 2.5;
const FLOW_STEP = 0.5;
const FLOW_MS = 100;

/**
 * Dash patterns for a dash of `dash` and a gap of `gap` moved forward by `step` each frame,
 * one whole period: drawn one after the other the dashes walk toward the line's end.
 */
export function flowDashes(dash: number, gap: number, step: number): number[][] {
  const out: number[][] = [];
  for (let s = 0; s < dash + gap - 1e-9; s += step) {
    if (s <= gap) out.push([0, s, dash, gap - s]);
    else out.push([s - gap, gap, dash - (s - gap), 0]);
  }
  return out;
}

type Coord = [number, number];

/** Rough metres between two lon/lat points (fine at city scale). */
function metres(a: Coord, b: Coord): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111_320;
}

/**
 * The trip's pieces (walks and rides, in travel order) joined into one line per journey:
 * a piece starting more than `breakM` from where the last one ended begins a new journey
 * (a meeting point draws one per start).
 */
export function joinPaths(lines: GeoJSON.FeatureCollection, breakM = 150): Coord[][] {
  const out: Coord[][] = [];
  for (const f of lines.features) {
    if (f.geometry.type !== 'LineString') continue;
    const c = f.geometry.coordinates as Coord[];
    const cur = out[out.length - 1];
    const last = cur?.[cur.length - 1];
    if (cur && last && metres(last, c[0]!) <= breakM) cur.push(...c);
    else out.push([...c]);
  }
  return out;
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
  g.lineWidth = 2;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  const data = g.getImageData(0, 0, px, px);
  return { image: { width: px, height: px, data: new Uint8Array(data.data.buffer) }, ratio };
}

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Sets up the look's layers on top of the trip's (after addMapLayers). Returns what the trip
 * drawing calls: `show` with the trip's lines (null: none), and the Lines layer's opacity
 * (line, edge) while a trip shows.
 */
export function addPathLook(map: maplibregl.Map, look: PathLook) {
  const walkOnly = [
    'all',
    ['==', ['get', 'walk'], true],
    ['!=', ['get', 'mode'], 'bike'],
  ] as unknown as maplibregl.ExpressionSpecification;
  if (look === 'a') {
    const a = arrowImage(INK, 24);
    map.addImage('trip-arrow', a.image, { pixelRatio: a.ratio });
    map.addLayer(
      {
        id: 'trip-edge',
        type: 'line',
        source: TRIP_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', walkOnly, 7, 11],
        },
      },
      'trip-line',
    );
    // Wider than the time rings, which are dark too.
    map.setPaintProperty('trip-line', 'line-color', INK);
    map.setPaintProperty('trip-line', 'line-width', 6.5);
    map.addLayer(
      {
        id: 'trip-arrows',
        type: 'symbol',
        source: TRIP_SOURCE,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 80,
          'icon-image': 'trip-arrow',
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      'trip-stops',
    );
    return { show: () => {}, routes: [0.5, 0.35] as const };
  }
  if (look === 'b') {
    map.addLayer(
      {
        id: 'trip-flow',
        type: 'line',
        source: TRIP_SOURCE,
        filter: ['!', walkOnly] as unknown as maplibregl.FilterSpecification,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-opacity': 0.95 },
      },
      'trip-stops',
    );
    const frames = flowDashes(FLOW_DASH, FLOW_GAP, FLOW_STEP);
    let frame = 0;
    let timer = 0;
    let shown = false;
    const tick = () => {
      frame = (frame + 1) % frames.length;
      map.setPaintProperty('trip-flow', 'line-dasharray', frames[frame]);
    };
    // Runs only while a trip shows and the page is in view.
    const run = () => {
      clearInterval(timer);
      timer = 0;
      if (shown && !document.hidden) timer = window.setInterval(tick, FLOW_MS);
    };
    map.setPaintProperty('trip-flow', 'line-dasharray', frames[0]);
    document.addEventListener('visibilitychange', run);
    return {
      show: (lines: GeoJSON.FeatureCollection | null) => {
        shown = !!lines?.features.length;
        run();
      },
      routes: [0.2, 0.15] as const,
    };
  }
  // c
  const a = arrowImage(END_COLOR, 22);
  map.addImage('trip-end-arrow', a.image, { pixelRatio: a.ratio });
  map.addSource(GRADIENT_SOURCE, { type: 'geojson', data: empty, lineMetrics: true });
  map.addSource(END_ARROW_SOURCE, { type: 'geojson', data: empty });
  map.addLayer(
    {
      id: 'trip-gradient-edge',
      type: 'line',
      source: GRADIENT_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 10 },
    },
    'trip-walk',
  );
  map.addLayer(
    {
      id: 'trip-gradient',
      type: 'line',
      source: GRADIENT_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': 6,
        'line-gradient': [
          'interpolate',
          ['linear'],
          ['line-progress'],
          0,
          ACCENT,
          1,
          END_COLOR,
        ] as maplibregl.ExpressionSpecification,
      },
    },
    'trip-walk',
  );
  map.addLayer(
    {
      id: 'trip-end-arrow',
      type: 'symbol',
      source: END_ARROW_SOURCE,
      layout: {
        'icon-image': 'trip-end-arrow',
        // The icon points east; a bearing counts from north.
        'icon-rotate': ['-', ['get', 'bearing'], 90] as maplibregl.ExpressionSpecification,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    'trip-stops',
  );
  // The shading carries the rides; walks show as white dots on it.
  map.setLayoutProperty('trip-line', 'visibility', 'none');
  map.setLayoutProperty('trip-bike', 'visibility', 'none');
  map.setPaintProperty('trip-walk', 'line-color', '#ffffff');
  map.setPaintProperty('trip-walk', 'line-width', 2.5);
  return {
    show: (lines: GeoJSON.FeatureCollection | null) => {
      const paths = lines ? joinPaths(lines) : [];
      const arrows = paths.map((p) => pointAlong(p, 0.85)).filter((x) => x !== null);
      (map.getSource(GRADIENT_SOURCE) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: paths.map((coordinates) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        })),
      });
      (map.getSource(END_ARROW_SOURCE) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: arrows.map((x) => ({
          type: 'Feature',
          properties: { bearing: x.bearing },
          geometry: { type: 'Point', coordinates: x.at },
        })),
      });
    },
    routes: [0.5, 0.35] as const,
  };
}

export type PathLookView = ReturnType<typeof addPathLook>;
