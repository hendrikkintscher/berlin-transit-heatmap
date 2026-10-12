// The map's own layers: Lines, outlines, the trip, stop dots, deserts and the orientation
// layers on top of the basemap. The heatmap image itself is added with the first result.

import type maplibregl from 'maplibre-gl';
import {
  HOME_COLORS,
  HOME_OUTLINE_MINUTES,
  homeBandOf,
  MODE_COLORS,
  OUTLINE_STEP_COLORS,
  OUTLINE_STEP_MINUTES,
} from './colors';
import { bezirke, landmarks, ringLine } from './orientation';
import { SEARCH_BBOX } from './search';

export const HEAT_SOURCE = 'heat';
export const HEAT_LAYER = 'heat-raster';
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
export type OutlineKind = 'time' | 'extra' | 'home';
/** Labelled, bolder outlines; the other 5-minute steps are drawn thin. */
const MAJOR_OUTLINES = [15, 30, 45];
const AREA_SOURCE = 'area';
const WATER = '#a9c7dc';
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
      paint: { 'line-color': '#ffffff', 'line-width': width(2.5), 'line-opacity': 0.9 },
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
    paint: { 'text-color': '#1d1d2b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
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
        'line-color': '#1d1530',
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
      'text-field': outlineLabel('time'),
      'text-font': font,
      'text-size': 11,
      'text-keep-upright': true,
    },
    paint: { 'text-color': '#1d1530', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  });
  map.addSource('ring', { type: 'geojson', data: ringLine });
  map.addLayer(
    {
      id: 'ring-line',
      type: 'line',
      source: 'ring',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#1d1530',
        'line-opacity': 0.35,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 3],
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
  // The connection to a tapped spot: rides in their line colours, walks dashed, rides
  // by bike as a thin solid line.
  map.addSource(TRIP_SOURCE, { type: 'geojson', data: empty });
  const tripLines = ['==', ['get', 'walk'], false] as maplibregl.FilterSpecification;
  map.addLayer({
    id: 'trip-casing',
    type: 'line',
    source: TRIP_SOURCE,
    filter: tripLines,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1d1530', 'line-width': 9.5 },
  });
  map.addLayer({
    id: 'trip-line',
    type: 'line',
    source: TRIP_SOURCE,
    filter: tripLines,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': modeColor, 'line-width': 5.5 },
  });
  map.addLayer({
    id: 'trip-walk',
    type: 'line',
    source: TRIP_SOURCE,
    filter: ['all', ['==', ['get', 'walk'], true], ['!=', ['get', 'mode'], 'bike']],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#1d1530', 'line-width': 3, 'line-dasharray': [0.4, 1.6] },
  });
  map.addLayer({
    id: 'trip-bike',
    type: 'line',
    source: TRIP_SOURCE,
    filter: ['==', ['get', 'mode'], 'bike'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1d1530', 'line-width': 3.5 },
  });
  map.addSource(TRIP_STOPS_SOURCE, { type: 'geojson', data: empty });
  map.addLayer({
    id: 'trip-stops',
    type: 'circle',
    source: TRIP_STOPS_SOURCE,
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#1d1530',
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'trip-stop-label',
    type: 'symbol',
    source: TRIP_STOPS_SOURCE,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': BOLD_FONT,
      'text-size': 12,
      'text-anchor': 'left',
      'text-offset': [0.8, 0],
      'text-optional': true,
    },
    paint: { 'text-color': '#1d1530', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
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
  map.addSource('bezirke', { type: 'geojson', data: bezirke });
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
      'text-color': '#2a2140',
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
    map.setPaintProperty('label_other', 'text-color', '#2a2140');
    map.setPaintProperty('label_other', 'text-halo-width', 1.8);
  }
  calmPaths(map);
  map.addSource('landmarks', { type: 'geojson', data: landmarks });
  map.addLayer({
    id: 'landmarks',
    type: 'symbol',
    source: 'landmarks',
    minzoom: 10.5,
    layout: {
      'text-field': ['concat', '◆ ', ['get', 'name']],
      'text-font': font,
      'text-size': 11,
      'text-anchor': 'left',
      'text-offset': [-0.45, 0],
      'text-optional': true,
    },
    paint: { 'text-color': '#4a3d63', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
  // House numbers at street level, so a tap can pick an exact address.
  map.addLayer({
    id: 'housenumbers',
    type: 'symbol',
    source: tiles,
    'source-layer': 'housenumber',
    minzoom: 17,
    layout: { 'text-field': ['get', 'housenumber'], 'text-font': font, 'text-size': 11 },
    paint: { 'text-color': '#4a4458', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
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

/**
 * Outline labels: minutes ("15 min"), extra minutes at a meeting point ("+15 min"), or on
 * the home map the clock time, its levels being minutes before 4 Uhr ("1:00").
 */
export function outlineLabel(kind: 'time' | 'extra' | 'home'): maplibregl.ExpressionSpecification {
  if (kind === 'home')
    return ['concat', ['to-string', ['%', ['-', 28, ['/', ['get', 'min'], 60]], 24]], ':00'];
  return ['concat', kind === 'extra' ? '+' : '', ['to-string', ['get', 'min']], ' min'];
}

/**
 * Outline look for the kind of map and whether the colour fill is on. With the fill, thin
 * dark lines labelled at 15, 30 and 45 min. Without it, a thin dashed line every 10 minutes
 * in one hue, darkest near the start, its minutes repeated along it; the home map's few
 * outlines take its legend colours instead.
 */
export function styleOutlines(map: maplibregl.Map, kind: OutlineKind, heat: boolean): void {
  if (!map.getLayer('outlines-line')) return;
  const steps = !heat && kind !== 'home';
  const tens: maplibregl.FilterSpecification = ['==', ['%', ['get', 'min'], 10], 0];
  const major: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'min'],
    [...MAJOR_OUTLINES],
    1,
    0,
  ];
  map.setPaintProperty(
    'outlines-line',
    'line-color',
    heat ? '#1d1530' : steps ? stepColors() : homeOutlineColors(),
  );
  map.setPaintProperty(
    'outlines-line',
    'line-opacity',
    heat ? ['match', ['get', 'min'], 15, 0.85, 30, 0.75, 45, 0.65, 0.4] : steps ? 0.9 : 1,
  );
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
      : steps
        ? ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 1.8]
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
  // Dashed lines go without the white edge, which would show through their gaps.
  map.setPaintProperty('outlines-casing', 'line-opacity', heat || steps ? 0 : 0.9);
  map.setPaintProperty('outlines-line', 'line-dasharray', steps ? [4, 2.5] : [1, 0]);
  map.setPaintProperty(
    'outlines-casing',
    'line-width',
    steps
      ? ['interpolate', ['linear'], ['zoom'], 9, 2.4, 14, 3.6]
      : ['interpolate', ['linear'], ['zoom'], 9, ['+', 3, major], 14, ['+', 5, ['*', 1.4, major]]],
  );
  map.setFilter('outlines-line', steps ? tens : null);
  map.setFilter('outlines-casing', steps ? tens : null);
  map.setFilter(
    'outlines-label',
    steps
      ? tens
      : heat && kind !== 'home'
        ? ['in', ['get', 'min'], ['literal', [...MAJOR_OUTLINES]]]
        : null,
  );
  map.setLayoutProperty('outlines-label', 'text-field', outlineLabel(kind));
  // Without the fill the labels are the key, so they repeat about every 3 cm on a phone.
  map.setLayoutProperty('outlines-label', 'symbol-spacing', steps ? 160 : 300);
}

/** The 10-minute outlines in one hue, darkest near the start. */
function stepColors(): maplibregl.ExpressionSpecification {
  return [
    'match',
    ['get', 'min'],
    ...OUTLINE_STEP_MINUTES.flatMap((m, i) => [m, OUTLINE_STEP_COLORS[i]]),
    '#1d1530',
  ] as never;
}

/** Each home map outline in the colour of the band just inside it, as the legend shows it. */
function homeOutlineColors(): maplibregl.ExpressionSpecification {
  const color = (min: number) => HOME_COLORS[homeBandOf(min * 60 - 1)];
  return [
    'match',
    ['get', 'min'],
    ...HOME_OUTLINE_MINUTES.flatMap((m) => [m, color(m)]),
    '#1d1530',
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

/** [west, south, east, north] as the corners a canvas source wants. */
export function cornerCoordinates([w, s, e, n]: [number, number, number, number]) {
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ] as [[number, number], [number, number], [number, number], [number, number]];
}
