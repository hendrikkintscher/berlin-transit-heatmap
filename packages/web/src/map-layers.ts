// The map's own layers: Lines, outlines, the trip, stop dots, deserts and the orientation
// layers on top of the basemap. The heatmap image itself is added with the first result.

import type maplibregl from 'maplibre-gl';
import {
  HOME_COLORS,
  HOME_OUTLINE_MINUTES,
  homeBandOf,
  INK,
  LIMIT_VEIL_ALPHA,
  MAP_TEXT,
  MODE_COLORS,
  RING_COLORS,
  RING_MINUTES,
  WATER,
} from './colors';
import { bezirke, landmarks, ringLine } from './orientation';
import { region } from './region';

/** The orientation overlay only where the region has one (Berlin's Ring, Bezirke, landmarks). */
const NONE = { type: 'FeatureCollection' as const, features: [] };
const orient = <T>(data: T) => (region.orientation ? data : NONE);
import { SEARCH_BBOX } from './search';

export const HEAT_SOURCE = 'heat';
export const HEAT_LAYER = 'heat-raster';
/** "Bis N Min.": the veil all around the image, which veils only what lies inside it. */
export const VEIL_SOURCE = 'limit-veil';
export const VEIL_LAYER = 'limit-veil';
export const ROUTES_SOURCE = 'routes';
export const LABELS_SOURCE = 'route-labels';
export const ROUTE_LAYERS = ['routes-casing', 'routes-line', 'routes-label'];
export const STATIONS_SOURCE = 'stations';
export const STATIONS_LAYER = 'stations-dot';
export const DESERT_SOURCE = 'desert';
export const DESERT_LAYER = 'desert-raster';
/** Departures-per-hour steps for the stop-frequency dots, and their colours. */
export const FREQ_STEPS = [4, 12, 30, 60];
export const FREQ_COLORS = ['#c6dbef', '#6baed6', '#2171b5', '#08519c', '#08306b'];
export const OUTLINES_SOURCE = 'outlines';
export const OUTLINE_LAYERS = ['outlines-casing', 'outlines-line', 'outlines-label'];
export type OutlineKind = 'time' | 'extra' | 'living' | 'home';
/** Labelled, bolder outlines; the other 5-minute steps are drawn thin. */
const MAJOR_OUTLINES = [15, 30, 45];
/** The Lines layer's opacity (line and white edge) while no trip is drawn. */
export const ROUTES_OPACITY = 0.55;
export const ROUTES_CASING_OPACITY = 0.4;
const AREA_SOURCE = 'area';
export const TRIP_SOURCE = 'trip';
export const TRIP_STOPS_SOURCE = 'trip-stops';
/** "What's different today": the stretch of a line that does not run, from changes.json. */
export const CHANGES_SOURCE = 'changes';
const CHANGE_COLOR = '#d6336c';
const BOLD_FONT = ['Noto Sans Bold'];

const modeColor = [
  'match',
  ['get', 'mode'],
  ...Object.entries(MODE_COLORS).flat(),
  '#444444',
] as unknown as maplibregl.ExpressionSpecification;

/** Adds the app's sources and layers once the basemap style has loaded. */
export function addMapLayers(
  map: maplibregl.Map,
  o: { routes: boolean; iso: boolean; desertCanvas: HTMLCanvasElement },
) {
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  // The colours go under the basemap's roads, so streets stay readable on top of them.
  const firstRoad =
    map.getStyle().layers.find((l) => 'source-layer' in l && l['source-layer'] === 'transportation')
      ?.id ?? ROUTE_LAYERS[0];
  // Faint roads in the city view, full strength once zoomed in to street level.
  for (const l of map.getStyle().layers) {
    if (l.type === 'line' && 'source-layer' in l && l['source-layer'] === 'transportation') {
      map.setPaintProperty(l.id, 'line-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        0.45,
        13,
        1,
      ]);
    }
  }
  const font = textFont(map);
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  map.addSource(ROUTES_SOURCE, { type: 'geojson', data: empty });
  map.addSource(LABELS_SOURCE, { type: 'geojson', data: empty });
  // Width follows the share of the map reached over a hop: 1 % thin, 50 %+ thick.
  const width = (extra: number): maplibregl.ExpressionSpecification => {
    const byShare = (k: number): maplibregl.ExpressionSpecification => [
      '+',
      extra,
      ['*', k, ['interpolate', ['linear'], ['sqrt', ['get', 'share']], 0.1, 1, 0.7, 7]],
    ];
    return ['interpolate', ['linear'], ['zoom'], 9, byShare(0.6), 14, byShare(1.4)];
  };
  const visibility = o.routes ? 'visible' : 'none';
  map.addLayer(
    {
      id: 'routes-casing',
      type: 'line',
      source: ROUTES_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility },
      // Lighter than full, so the time rings lead (C9).
      paint: {
        'line-color': '#ffffff',
        'line-width': width(2.5),
        'line-opacity': ROUTES_CASING_OPACITY,
      },
    },
    firstSymbol,
  );
  map.addLayer(
    {
      id: 'routes-line',
      type: 'line',
      source: ROUTES_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility },
      paint: {
        'line-color': modeColor,
        'line-width': width(0),
        'line-opacity': ROUTES_OPACITY,
      },
    },
    firstSymbol,
  );
  map.addLayer({
    id: 'routes-label',
    type: 'symbol',
    source: LABELS_SOURCE,
    layout: {
      visibility,
      'symbol-placement': 'line',
      'symbol-spacing': 220,
      'text-field': ['get', 'names'],
      'text-font': font,
      'text-size': 11,
      'text-max-angle': 40,
    },
    paint: { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
  const [w, s, e, n] = SEARCH_BBOX;
  map.addSource(DESERT_SOURCE, {
    type: 'canvas',
    canvas: o.desertCanvas,
    coordinates: [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
    animate: false,
  });
  map.addLayer(
    {
      id: DESERT_LAYER,
      type: 'raster',
      source: DESERT_SOURCE,
      layout: { visibility: 'none' },
      paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    },
    firstRoad,
  );
  // Orientation on top of the colours: water in clear blue, parks and woods under a light
  // green veil, and the Ringbahn as a faint frame.
  const tiles = 'openmaptiles';
  map.addLayer(
    {
      id: 'green-veil',
      type: 'fill',
      source: tiles,
      'source-layer': 'park',
      paint: { 'fill-color': '#e4eedb', 'fill-opacity': 0.45 },
    },
    firstRoad,
  );
  map.addLayer(
    {
      id: 'wood-veil',
      type: 'fill',
      source: tiles,
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': '#e4eedb', 'fill-opacity': 0.35 },
    },
    firstRoad,
  );
  map.addLayer(
    {
      id: 'water-top',
      type: 'fill',
      source: tiles,
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': WATER },
    },
    firstRoad,
  );
  map.addLayer(
    {
      id: 'waterway-top',
      type: 'line',
      source: tiles,
      'source-layer': 'waterway',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: {
        'line-color': WATER,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 3],
      },
    },
    firstRoad,
  );
  map.addSource(OUTLINES_SOURCE, { type: 'geojson', data: empty });
  const isoVisibility = o.iso ? 'visible' : 'none';
  // Without the colour fill, a white edge keeps the coloured outlines readable on the map.
  map.addLayer(
    {
      id: 'outlines-casing',
      type: 'line',
      source: OUTLINES_SOURCE,
      layout: { 'line-join': 'round', visibility: isoVisibility },
      paint: { 'line-color': '#ffffff', 'line-opacity': 0, 'line-width': 1 },
    },
    ROUTE_LAYERS[0],
  );
  map.addLayer(
    {
      id: 'outlines-line',
      type: 'line',
      source: OUTLINES_SOURCE,
      layout: { 'line-join': 'round', visibility: isoVisibility },
      paint: {
        'line-color': INK,
        'line-opacity': ['match', ['get', 'min'], 15, 0.85, 30, 0.75, 45, 0.65, 0.4],
        // 15 min boldest, then 30 and 45; the other 5-minute steps are hairlines.
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9,
          ['match', ['get', 'min'], 15, 2, 30, 1.5, 45, 1.1, 0.5],
          14,
          ['match', ['get', 'min'], 15, 3.2, 30, 2.4, 45, 1.8, 1],
        ],
      },
    },
    ROUTE_LAYERS[0],
  );
  map.addLayer({
    id: 'outlines-label',
    type: 'symbol',
    source: OUTLINES_SOURCE,
    filter: ['in', ['get', 'min'], ['literal', [...MAJOR_OUTLINES]]],
    layout: {
      visibility: isoVisibility,
      'symbol-placement': 'line',
      'symbol-spacing': 300,
      'text-field': outlineLabel('time', 'min'),
      'text-font': font,
      'text-size': 11,
      'text-keep-upright': true,
    },
    paint: { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  });
  map.addSource('ring', { type: 'geojson', data: orient(ringLine) });
  map.addLayer(
    {
      id: 'ring-line',
      type: 'line',
      source: 'ring',
      layout: { 'line-join': 'round' },
      // A soft wide band: where the Ring is, without another hard line.
      paint: {
        'line-color': INK,
        'line-opacity': 0.1,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 10],
      },
    },
    ROUTE_LAYERS[0],
  );
  // A faint frame where the computed area ends.
  const [aw, as, ae, an] = SEARCH_BBOX;
  map.addSource(AREA_SOURCE, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [aw, an],
          [ae, an],
          [ae, as],
          [aw, as],
          [aw, an],
        ],
      },
    },
  });
  map.addLayer(
    {
      id: 'area-outline',
      type: 'line',
      source: AREA_SOURCE,
      paint: {
        'line-color': '#5e1f8c',
        'line-opacity': 0.4,
        'line-width': 1.5,
        'line-dasharray': [3, 2],
      },
    },
    firstSymbol,
  );
  map.addSource(STATIONS_SOURCE, { type: 'geojson', data: empty });
  map.addLayer(
    {
      id: STATIONS_LAYER,
      type: 'circle',
      source: STATIONS_SOURCE,
      layout: { visibility: 'none' },
      paint: {
        'circle-color': [
          'step',
          ['get', 'perHour'],
          FREQ_COLORS[0],
          ...FREQ_STEPS.flatMap((s, i) => [s, FREQ_COLORS[i + 1]]),
        ] as unknown as maplibregl.ExpressionSpecification,
        // Busier stations are bigger; everything grows as you zoom in.
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9,
          ['interpolate', ['linear'], ['get', 'perHour'], 0, 1.2, 60, 2.5, 200, 4],
          14,
          ['interpolate', ['linear'], ['get', 'perHour'], 0, 4, 60, 8, 200, 12],
        ] as unknown as maplibregl.ExpressionSpecification,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1.5],
      },
    },
    'routes-label',
  );
  // The connection to a tapped spot: rides in their line colours without a border, walks
  // dashed, rides by bike as a thin solid line.
  map.addSource(TRIP_SOURCE, { type: 'geojson', data: empty });
  const tripLines = ['==', ['get', 'walk'], false] as maplibregl.FilterSpecification;
  map.addLayer({
    id: 'trip-line',
    type: 'line',
    source: TRIP_SOURCE,
    filter: tripLines,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    // No dark border, the line colour alone (Hendrik, 2026-10-12).
    paint: { 'line-color': modeColor, 'line-width': 5.5 },
  });
  map.addLayer({
    id: 'trip-walk',
    type: 'line',
    source: TRIP_SOURCE,
    filter: ['all', ['==', ['get', 'walk'], true], ['!=', ['get', 'mode'], 'bike']],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': INK, 'line-width': 3, 'line-dasharray': [0.4, 1.6] },
  });
  map.addLayer({
    id: 'trip-bike',
    type: 'line',
    source: TRIP_SOURCE,
    filter: ['==', ['get', 'mode'], 'bike'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': 3.5 },
  });
  map.addSource(TRIP_STOPS_SOURCE, { type: 'geojson', data: empty });
  map.addLayer({
    id: 'trip-stops',
    type: 'circle',
    source: TRIP_STOPS_SOURCE,
    // In the line's colour, so they belong to the line; changes smaller than where you get
    // on and off.
    paint: {
      'circle-radius': ['case', ['get', 'end'], 5, 3.5],
      'circle-color': '#ffffff',
      'circle-stroke-color': modeColor,
      'circle-stroke-width': ['case', ['get', 'end'], 2.5, 2],
    },
  });
  map.addLayer({
    id: 'trip-stop-label',
    type: 'symbol',
    source: TRIP_STOPS_SOURCE,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': BOLD_FONT,
      'text-size': ['case', ['get', 'end'], 12, 11],
      'text-anchor': 'left',
      'text-offset': [0.8, 0],
      'text-optional': true,
    },
    paint: { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });
  map.addSource(CHANGES_SOURCE, { type: 'geojson', data: empty });
  map.addLayer({
    id: 'changes-casing',
    type: 'line',
    source: CHANGES_SOURCE,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 9 },
  });
  map.addLayer({
    id: 'changes-line',
    type: 'line',
    source: CHANGES_SOURCE,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': CHANGE_COLOR, 'line-width': 5, 'line-dasharray': [1.6, 1] },
  });
  map.addLayer({
    id: 'changes-stops',
    type: 'circle',
    source: CHANGES_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5,
      'circle-color': ['case', ['get', 'gone'], CHANGE_COLOR, '#ffffff'],
      'circle-stroke-color': CHANGE_COLOR,
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'changes-label',
    type: 'symbol',
    source: CHANGES_SOURCE,
    filter: ['has', 'name'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': BOLD_FONT,
      'text-size': 12,
      'text-anchor': 'left',
      'text-offset': [0.8, 0],
      'text-optional': true,
    },
    paint: { 'text-color': CHANGE_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });
  // Bezirke at city zoom; the basemap's Ortsteil names take over from zoom 11.5.
  map.addSource('bezirke', { type: 'geojson', data: orient(bezirke) });
  map.addLayer({
    id: 'bezirke-label',
    type: 'symbol',
    source: 'bezirke',
    maxzoom: 11.5,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': BOLD_FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 11, 13],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.06,
      'text-max-width': 7,
    },
    paint: {
      'text-color': INK,
      'text-opacity': 0.8,
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.8,
    },
  });
  if (map.getLayer('label_other')) {
    map.setLayoutProperty('label_other', 'text-font', BOLD_FONT);
    map.setLayoutProperty('label_other', 'text-size', [
      'interpolate',
      ['linear'],
      ['zoom'],
      11,
      11,
      14,
      14,
    ]);
    map.setPaintProperty('label_other', 'text-color', INK);
    map.setPaintProperty('label_other', 'text-halo-width', 1.8);
  }
  calmPaths(map);
  calmBasemap(map);
  map.addSource('landmarks', { type: 'geojson', data: orient(landmarks) });
  map.addLayer({
    id: 'landmarks',
    type: 'symbol',
    source: 'landmarks',
    minzoom: 12,
    layout: {
      'text-field': ['concat', '◆ ', ['get', 'name']],
      'text-font': font,
      'text-size': 11,
      'text-anchor': 'left',
      'text-offset': [-0.45, 0],
      'text-optional': true,
    },
    paint: { 'text-color': MAP_TEXT, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
  // House numbers at street level, so a tap can pick an exact address.
  map.addLayer({
    id: 'housenumbers',
    type: 'symbol',
    source: tiles,
    'source-layer': 'housenumber',
    minzoom: 17,
    layout: { 'text-field': ['get', 'housenumber'], 'text-font': font, 'text-size': 11 },
    paint: { 'text-color': MAP_TEXT, 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  });
}

/** A font the basemap's glyph server has, taken from its own labels. */
function textFont(map: maplibregl.Map): string[] {
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol') continue;
    const f = map.getLayoutProperty(l.id, 'text-font') as unknown;
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) return f as string[];
  }
  return ['Noto Sans Regular'];
}

/** The chosen opacity in the city view, fading at street level so names and numbers read. */
export function heatOpacity(percent: number): maplibregl.ExpressionSpecification {
  const o = percent / 100;
  return ['interpolate', ['linear'], ['zoom'], 13, o, 16, o * 0.45];
}

/** The veil around the "Bis N Min." image as strong as the image's own, at any zoom. */
export function veilOpacity(percent: number): maplibregl.ExpressionSpecification {
  const o = (percent / 100) * LIMIT_VEIL_ALPHA;
  return ['interpolate', ['linear'], ['zoom'], 13, o, 16, o * 0.45];
}

/** The whole world but the image's box: the veil around the "Bis N Min." image. */
export function veilAround([w, s, e, n]: [number, number, number, number]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        [
          [w, s],
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ],
      ],
    },
  };
}

/**
 * Outline labels: minutes ("15 Min."), extra minutes at a meeting point ("+15 min"), or on
 * the home map the clock time, its levels being minutes before 4 Uhr ("1:00").
 */
export function outlineLabel(kind: OutlineKind, unit: string): maplibregl.ExpressionSpecification {
  if (kind === 'home')
    return ['concat', ['to-string', ['%', ['-', 28, ['/', ['get', 'min'], 60]], 24]], ':00'];
  // The where-to-live map shows a weighted average: "Ø 40".
  if (kind === 'living') return ['concat', 'Ø ', ['to-string', ['get', 'min']]];
  return ['concat', kind === 'extra' ? '+' : '', ['to-string', ['get', 'min']], ` ${unit}`];
}

/**
 * Outline look for the kind of map and whether the colour fill is on. Without the fill,
 * crisp labelled rings at 15, 30, 45 and 60 min (styleRings). With it, thin dark lines
 * labelled at 15, 30 and 45 min; the home map's few outlines take its legend colours.
 */
export function styleOutlines(
  map: maplibregl.Map,
  kind: OutlineKind,
  heat: boolean,
  unit: string,
): void {
  if (!map.getLayer('outlines-line')) return;
  if (!heat && kind !== 'home') return styleRings(map, kind, unit);
  const major: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'min'],
    [...MAJOR_OUTLINES],
    1,
    0,
  ];
  map.setPaintProperty('outlines-line', 'line-color', heat ? INK : homeOutlineColors());
  map.setPaintProperty(
    'outlines-line',
    'line-opacity',
    heat ? ['match', ['get', 'min'], 15, 0.85, 30, 0.75, 45, 0.65, 0.4] : 1,
  );
  map.setPaintProperty('outlines-line', 'line-blur', 0);
  map.setPaintProperty(
    'outlines-line',
    'line-width',
    heat
      ? [
          'interpolate',
          ['linear'],
          ['zoom'],
          9,
          ['match', ['get', 'min'], 15, 2, 30, 1.5, 45, 1.1, 0.5],
          14,
          ['match', ['get', 'min'], 15, 3.2, 30, 2.4, 45, 1.8, 1],
        ]
      : [
          'interpolate',
          ['linear'],
          ['zoom'],
          9,
          ['+', 1.4, major],
          14,
          ['+', 2.6, ['*', 1.4, major]],
        ],
  );
  map.setPaintProperty('outlines-casing', 'line-opacity', heat ? 0 : 0.9);
  map.setPaintProperty('outlines-casing', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    ['+', 3, major],
    14,
    ['+', 5, ['*', 1.4, major]],
  ]);
  map.setFilter('outlines-line', null);
  map.setFilter('outlines-casing', null);
  map.setFilter(
    'outlines-label',
    heat && kind !== 'home' ? ['in', ['get', 'min'], ['literal', [...MAJOR_OUTLINES]]] : null,
  );
  map.setLayoutProperty('outlines-label', 'text-field', outlineLabel(kind, unit));
  map.setLayoutProperty('outlines-label', 'symbol-spacing', 300);
}

/** Without the colour fill: four crisp rings with a white edge, each labelled (C9). */
function styleRings(map: maplibregl.Map, kind: OutlineKind, unit: string): void {
  const rings: maplibregl.FilterSpecification = ['in', ['get', 'min'], ['literal', RING_MINUTES]];
  map.setPaintProperty('outlines-line', 'line-color', [
    'match',
    ['get', 'min'],
    ...RING_MINUTES.slice(0, -1).flatMap((m, i) => [m, RING_COLORS[i]]),
    RING_COLORS[RING_MINUTES.length - 1],
  ] as never);
  map.setPaintProperty('outlines-line', 'line-opacity', 1);
  map.setPaintProperty('outlines-line', 'line-blur', 0);
  map.setPaintProperty('outlines-line', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    2.6,
    14,
    4,
  ]);
  map.setPaintProperty('outlines-casing', 'line-opacity', 0.9);
  map.setPaintProperty('outlines-casing', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    5,
    14,
    7,
  ]);
  map.setFilter('outlines-line', rings);
  map.setFilter('outlines-casing', rings);
  map.setFilter('outlines-label', rings);
  map.setLayoutProperty('outlines-label', 'text-field', outlineLabel(kind, unit));
  map.setLayoutProperty('outlines-label', 'symbol-spacing', 260);
}

/** Each home map outline in the colour of the band just inside it, as the legend shows it. */
function homeOutlineColors(): maplibregl.ExpressionSpecification {
  const color = (min: number) => HOME_COLORS[homeBandOf(min * 60 - 1)];
  return [
    'match',
    ['get', 'min'],
    ...HOME_OUTLINE_MINUTES.flatMap((m) => [m, color(m)]),
    INK,
  ] as never;
}

/**
 * Footpaths and cycle tracks drawn thin and faint at street level. Many of them are
 * sidewalks and cycle tracks mapped as their own lines right next to a street, which made
 * streets look doubled or tripled; the tiles do not say which ones (no sidewalk tag), so
 * those along streets (footway, cycleway) go almost silent, while paths through parks,
 * squares and steps stay a little more visible. A tapped trip's walk is drawn on its own.
 */
function calmPaths(map: maplibregl.Map): void {
  if (!map.getLayer('highway_path')) return;
  const alongStreets: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'subclass'],
    ['footway', 'cycleway', 'platform', 'corridor'],
    true,
    false,
  ];
  map.setPaintProperty('highway_path', 'line-color', '#e0e0dc');
  map.setPaintProperty('highway_path', 'line-opacity', ['case', alongStreets, 0.55, 0.9]);
  map.setPaintProperty('highway_path', 'line-width', [
    'interpolate',
    ['exponential', 1.2],
    ['zoom'],
    13,
    ['case', alongStreets, 0.4, 0.6],
    20,
    ['case', alongStreets, 2, 3.5],
  ]);
}

/**
 * A calmer base map under the outlines and Lines: its own railways (which doubled the
 * Lines) and road shields go, small streets wait until zoom 12, and the city view's streets
 * are softer, coming to full strength at street level.
 */
function calmBasemap(map: maplibregl.Map): void {
  for (const id of [
    'railway_transit',
    'railway_transit_dashline',
    'railway_service',
    'railway_service_dashline',
    'railway',
    'railway_dashline',
    'highway-shield-non-us',
    'highway-shield-us-interstate',
    'road_shield_us',
  ])
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  if (map.getLayer('highway_minor')) map.setLayerZoomRange('highway_minor', 12, 24);
  for (const id of [
    'highway_minor',
    'highway_major_casing',
    'highway_major_inner',
    'highway_major_subtle',
    'highway_motorway_casing',
    'highway_motorway_inner',
    'highway_motorway_subtle',
    'highway_motorway_bridge_casing',
    'highway_motorway_bridge_inner',
  ])
    if (map.getLayer(id))
      map.setPaintProperty(id, 'line-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        0.3,
        12,
        0.55,
        14,
        1,
      ]);
}

/** [west, south, east, north] as the corners a canvas source wants. */
export function cornerCoordinates([w, s, e, n]: [number, number, number, number]) {
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ] as [[number, number], [number, number], [number, number], [number, number]];
}
