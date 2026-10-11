import maplibregl, { type CanvasSource, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { BAND_COLORS, BAND_EDGES_MIN, DIFF_COLORS, DIFF_EDGES_MIN, bandLabel } from './colors';
import { reverseAddress, reversePlace, searchPlaces, SEARCH_BBOX, type Place } from './search';
import { bezirke, landmarks, ringLine } from './orientation';
import {
  loadFavourites,
  newId,
  parseImport,
  saveFavourites,
  score,
  WEIGHTS,
  type Weight,
} from './favourites';
import {
  formatDecimal,
  formatNumber,
  initialLang,
  lang,
  readStoredLang,
  setLang,
  t,
  type Lang,
} from './i18n';
import {
  computeWindow,
  desertThresholds,
  parseWhen,
  whenAt,
  whenFromParams,
  windowName,
  type DayType,
  type Direction,
  type When,
} from './when';
import type {
  FromWorker,
  Measure,
  RasterLayer,
  StationProps,
  TimetableInfo,
  ToWorker,
  Window,
} from './protocol';

const BERLIN: [number, number] = [13.405, 52.515];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const HEAT_SOURCE = 'heat';
const HEAT_LAYER = 'heat-raster';
const ROUTES_SOURCE = 'routes';
const LABELS_SOURCE = 'route-labels';
const ROUTE_LAYERS = ['routes-casing', 'routes-line', 'routes-label'];
const STATIONS_SOURCE = 'stations';
const STATIONS_LAYER = 'stations-dot';
const DESERT_SOURCE = 'desert';
const DESERT_LAYER = 'desert-raster';
/** Departures-per-hour steps for the stop-frequency dots, and their colours. */
const FREQ_STEPS = [4, 12, 30, 60];
const FREQ_COLORS = ['#c6dbef', '#6baed6', '#2171b5', '#08519c', '#08306b'];
const OUTLINES_SOURCE = 'outlines';
const OUTLINE_LAYERS = ['outlines-line', 'outlines-label'];
/** Labelled, bolder outlines; the other 5-minute steps are drawn thin. */
const MAJOR_OUTLINES = [15, 30, 45];
const AREA_SOURCE = 'area';
const WATER = '#a9c7dc';
const TRIP_SOURCE = 'trip';
const TRIP_STOPS_SOURCE = 'trip-stops';
const BOLD_FONT = ['Noto Sans Bold'];
const DEFAULT_OPACITY = 80;
/** The map opens at the current day type and hour in Berlin, unless a link says otherwise. */
const NOW_WHEN = whenAt(new Date());
/** Walking speeds offered in the menu, in km/h; 4 is the default. */
const WALK_SPEEDS = [3, 4, 5, 6];
const DEFAULT_WALK_KMH = 4;
const walkSpeed = (v: number) => (WALK_SPEEDS.includes(v) ? v : DEFAULT_WALK_KMH);

// Line colours roughly follow the usual Berlin map conventions.
const MODE_COLORS: Record<string, string> = {
  sbahn: '#00843d',
  ubahn: '#0a5ea8',
  tram: '#c8102e',
  bus: '#7b2d8e',
  regional: '#8a1c1c',
  ferry: '#0090c8',
};

const modeColor = [
  'match',
  ['get', 'mode'],
  ...Object.entries(MODE_COLORS).flat(),
  '#444444',
] as unknown as maplibregl.ExpressionSpecification;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const loadbar = $('loadbar');
const hint = $('hint');
const readout = $('readout');
const readoutText = $('readout-text');
const statusEl = $('status');
const feedInfo = $('feed-info');
const infoDialog = $<HTMLDialogElement>('info');
const whenBtn = $<HTMLButtonElement>('when-btn');
const whenDialog = $<HTMLDialogElement>('when');
const dayButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-day]')];
const hourGrid = $('hour-grid');
const dirButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-dir]')];
const measureButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-measure]')];
const cmpDay = $<HTMLSelectElement>('cmp-day');
const cmpHour = $<HTMLSelectElement>('cmp-hour');
const cmpChip = $('cmp');
const routesToggle = $<HTMLInputElement>('routes-toggle');
const freqToggle = $<HTMLInputElement>('freq-toggle');
const desertToggle = $<HTMLInputElement>('desert-toggle');
const layerLegend = $('layer-legend');
const meetChip = $('meet');
const favChip = $<HTMLButtonElement>('fav-score');
const favList = $<HTMLUListElement>('fav-list');
const secondBtn = $<HTMLButtonElement>('readout-second');
const menuDialog = $<HTMLDialogElement>('menu');
const langButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-lang]')];
const walkButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-walk]')];
const isoToggle = $<HTMLInputElement>('iso-toggle');
const opacityInput = $<HTMLInputElement>('opacity');
const locateBtn = $<HTMLButtonElement>('locate-btn');
const tip = $('tip');
const tipText = $('tip-text');
const tipAction = $<HTMLButtonElement>('tip-action');
const installBtn = $<HTMLButtonElement>('install-btn');

const state: {
  /** Weekday or weekend, and the departure hour; `window` names its timetable file. */
  when: When;
  window: Window;
  /** Leave in the chosen hour, or arrive in it. */
  direction: Direction;
  /** Typical (averaged over the hour, waiting included) or best-case minutes. */
  measure: Measure;
  /** Compare: a second time; the map then shows how much longer trips take then. */
  compare: When | null;
  origin: { lat: number; lon: number } | null;
  /** Meeting point: the second person's start. */
  second: { lat: number; lon: number } | null;
  pending: { lat: number; lon: number } | null;
  requestId: number;
  tripId: number;
  info: Partial<Record<Window, TimetableInfo>>;
  routes: boolean;
  /** Stop-frequency dots and transit-desert shading. */
  freq: boolean;
  desert: boolean;
  /** Isochrone outlines at 15/30/45 min. */
  iso: boolean;
  /** Heatmap opacity in percent; remembered on this device. */
  opacity: number;
  /** Walking speed in km/h; remembered on this device, carried in shared links. */
  walkKmh: number;
  /** Re-renders the status line, so it follows a language switch. */
  status: () => string;
} = {
  when: NOW_WHEN,
  window: windowName(NOW_WHEN),
  direction: 'depart',
  measure: 'typical',
  compare: null,
  origin: null,
  second: null,
  pending: null,
  requestId: 0,
  tripId: 0,
  info: {},
  routes: true,
  freq: false,
  desert: false,
  iso: false,
  opacity: readNumber('heat-opacity', DEFAULT_OPACITY),
  walkKmh: walkSpeed(readNumber('walk-kmh', DEFAULT_WALK_KMH)),
  status: () => '',
};
type Result = Extract<FromWorker, { type: 'result' }>;
let lastResult: Result | null = null;
type Layers = Extract<FromWorker, { type: 'layers' }>;
/** Layer data per window, fetched from the worker the first time a layer is shown. */
const layerData: Partial<Record<Window, Layers>> = {};
const layersRequested = new Set<Window>();

// The heatmap is painted into this canvas and shown through a MapLibre canvas source.
const heatCanvas = document.createElement('canvas');
heatCanvas.width = heatCanvas.height = 1;
const desertCanvas = document.createElement('canvas');
desertCanvas.width = desertCanvas.height = 1;

// ---------- legend ----------
// Every band gets the same width, so the finer 20–50 min bands get the most room.
$('legend-bar').append(
  ...BAND_COLORS.map((c, b) => {
    const s = document.createElement('span');
    s.style.background = c;
    s.title = `${bandLabel(b)} min`;
    return s;
  }),
);
const legendTicks = [0, 10, 20, 30, 40, 50, 60, 120].map((m) => {
  const tick = document.createElement('span');
  const i = BAND_EDGES_MIN.indexOf(m);
  tick.style.left = `${(100 * i) / BAND_COLORS.length}%`;
  tick.textContent = String(m);
  tick.dataset.m = String(m);
  if (m === 120) tick.dataset.t = 'legendMax';
  return tick;
});
$('legend-ticks').append(...legendTicks);

// Comparing two times: how many minutes longer (warm) or shorter (teal) the trip takes then.
$('diff-bar').append(
  ...DIFF_COLORS.map((c) => {
    const s = document.createElement('span');
    s.style.background = c;
    return s;
  }),
);
$('diff-ticks').append(
  ...[-20, -10, -5, 5, 10, 20, 30].map((m) => {
    const tick = document.createElement('span');
    tick.style.left = `${(100 * DIFF_EDGES_MIN.indexOf(m)) / DIFF_COLORS.length}%`;
    tick.textContent = m > 0 ? `+${m}` : `−${-m}`;
    return tick;
  }),
  Object.assign(document.createElement('span'), { textContent: 'min' }),
);
/** The travel-time legend, the comparison legend, or (meeting point) extra minutes "+0 … +120". */
function showLegend(diff: boolean, extra = false) {
  for (const id of ['legend-bar', 'legend-ticks']) $(id).hidden = diff;
  for (const id of ['diff-bar', 'diff-ticks']) $(id).hidden = !diff;
  $('legend-bar').parentElement!.setAttribute(
    'aria-label',
    t(diff ? 'legendDiff' : extra ? 'legendExtra' : 'legend'),
  );
  for (const tick of legendTicks) {
    const m = Number(tick.dataset.m);
    if (m === 120) {
      tick.dataset.t = extra ? 'legendMaxExtra' : 'legendMax';
      tick.textContent = t(tick.dataset.t as 'legendMax');
    } else tick.textContent = extra ? `+${m}` : String(m);
  }
}

/** Small per-device settings and "hint seen" flags; storage may be blocked. */
function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts for this visit only.
  }
}
const seen = (key: string) => readNumber(`seen-${key}`, 0) > 0;

let statusTimer = 0;
/** Sets the status line; `fade` hides it again after a few seconds. */
function setStatus(render: () => string, fade = false) {
  state.status = render;
  statusEl.textContent = render();
  statusEl.classList.remove('faded');
  clearTimeout(statusTimer);
  if (fade) statusTimer = window.setTimeout(() => statusEl.classList.add('faded'), 5000);
}

// ---------- worker ----------
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);
send({ type: 'init', dataBase: new URL('data/', document.baseURI).href });

worker.onmessage = (ev: MessageEvent<FromWorker>) => {
  const m = ev.data;
  if (m.type === 'progress') {
    if (m.window !== computedWindow() && m.window !== state.window) return;
    loadbar.hidden = false;
    loadbar.classList.toggle('indeterminate', !m.total || m.loaded > m.total);
    (loadbar.firstElementChild as HTMLElement).style.width = m.total
      ? `${Math.min(100, (100 * m.loaded) / m.total)}%`
      : '';
  } else if (m.type === 'loaded') {
    state.info[m.info.window] = m.info;
    if (m.info.window === computedWindow()) loadbar.hidden = true;
    renderFeedInfo();
  } else if (m.type === 'walk') {
    // Footpaths arrived: redo what was computed with straight-line walks.
    redoWalks();
  } else if (m.type === 'result') {
    if (m.id !== state.requestId) return;
    lastResult = m;
    showResult(m);
    loadbar.hidden = true;
    const s = m.totalMs / 1000;
    setStatus(() => t('computed', { s: formatDecimal(s, 1) }), true);
    showTips();
  } else if (m.type === 'trip') {
    if (m.id === state.tripId && !readout.hidden) showTrip(m);
  } else if (m.type === 'layers') {
    layerData[m.window] = m;
    if (m.window === state.window) showLayers();
  } else if (m.type === 'error') {
    loadbar.hidden = true;
    setStatus(() => t('failed', { message: m.message }));
  }
};

function renderFeedInfo() {
  const i = state.info[state.window] ?? state.info[computedWindow()];
  feedInfo.textContent = i
    ? t('feedInfo', { date: i.serviceDate, version: i.feedVersion, stops: formatNumber(i.stops) })
    : t('feedLoading');
  $('data-note').textContent = i ? t('dataNote', { date: formatDate(i.serviceDate) }) : '';
}
/** "13.10.2026" / "13 Oct 2026" from an ISO date. */
function formatDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang() === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric',
    month: lang() === 'de' ? 'numeric' : 'short',
    year: 'numeric',
  });
}

/** Recomputes the map and the walk-based layers, e.g. after a walking-speed change. */
function redoWalks() {
  for (const w of Object.keys(layerData)) delete layerData[w];
  layersRequested.clear();
  showLayers();
  compute();
}

/** The timetable file the map is computed from (arriving uses the hour before). */
const computedWindow = () => computeWindow(state.when, state.direction);

function compute() {
  if (!state.origin) return;
  state.requestId++;
  loadbar.hidden = false;
  loadbar.classList.add('indeterminate');
  setStatus(() => t('computing'));
  send({
    type: 'compute',
    id: state.requestId,
    window: computedWindow(),
    direction: state.direction,
    measure: state.measure,
    ...(state.measure === 'next' ? { leaveOffset: leaveOffset() } : {}),
    walkKmh: state.walkKmh,
    ...(state.compare ? { compare: computeWindow(state.compare, state.direction) } : {}),
    ...state.origin,
    ...(state.second ? { second: state.second } : {}),
  });
}

// ---------- URL state (?from=lat,lon&w=night&routes=0&lang=en) ----------
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('routes') === '0') state.routes = false;
  const layers = (p.get('layers') ?? '').split(',');
  state.freq = layers.includes('freq');
  state.desert = layers.includes('desert');
  state.iso = layers.includes('iso');
  state.origin = parsePoint(p.get('from'));
  state.second = state.origin ? parsePoint(p.get('with')) : null;
  state.when = whenFromParams(p, NOW_WHEN);
  state.window = windowName(state.when);
  if (p.get('dir') === 'arr') state.direction = 'arrive';
  if (p.get('m') === 'best' || p.get('m') === 'next') state.measure = p.get('m') as Measure;
  state.compare = parseWhen(p.get('cmp'));
  if (p.has('walk')) state.walkKmh = walkSpeed(Number(p.get('walk')));
}
function parsePoint(v: string | null) {
  const [lat, lon] = (v ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? { lat, lon } : null;
}
const pointParam = (o: { lat: number; lon: number }) => `${o.lat.toFixed(5)},${o.lon.toFixed(5)}`;
function writeUrl() {
  const p = new URLSearchParams();
  if (state.origin) p.set('from', pointParam(state.origin));
  if (state.second) p.set('with', pointParam(state.second));
  if (state.window !== windowName(NOW_WHEN)) p.set('t', state.window);
  if (state.direction === 'arrive') p.set('dir', 'arr');
  if (state.measure !== 'typical') p.set('m', state.measure);
  if (state.compare) p.set('cmp', windowName(state.compare));
  if (state.walkKmh !== DEFAULT_WALK_KMH) p.set('walk', String(state.walkKmh));
  if (!state.routes) p.set('routes', '0');
  const layers = [state.freq && 'freq', state.desert && 'desert', state.iso && 'iso']
    .filter(Boolean)
    .join(',');
  if (layers) p.set('layers', layers);
  // Keep an explicit ?lang= so a shared English link stays English.
  if (urlLang && urlLang === lang()) p.set('lang', urlLang);
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}
readUrl();
const urlLang = new URLSearchParams(location.search).get('lang');
setLang(initialLang(location.search, readStoredLang()), false);

// ---------- map ----------
const map = new maplibregl.Map({
  container: 'map',
  style: STYLE_URL,
  center: state.origin ? [state.origin.lon, state.origin.lat] : BERLIN,
  zoom: 10.3,
  minZoom: 8,
  maxZoom: 18,
  attributionControl: { compact: true },
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();

const markerEl = document.createElement('div');
markerEl.className = 'origin-marker';
const marker = new maplibregl.Marker({ element: markerEl, draggable: true });
marker.on('dragend', () => {
  const { lat, lng } = marker.getLngLat();
  setOrigin(lat, lng);
});

const marker2El = document.createElement('div');
marker2El.className = 'origin-marker second';
const marker2 = new maplibregl.Marker({ element: marker2El, draggable: true });
marker2.on('dragend', () => {
  const { lat, lng } = marker2.getLngLat();
  setSecond({ lat, lon: lng });
});

// Tapping a start marker offers to remove it; a drag must not count as that tap.
let draggedAt = 0;
for (const [m, el, which] of [
  [marker, markerEl, 1],
  [marker2, marker2El, 2],
] as const) {
  m.on('dragstart', () => (draggedAt = Date.now()));
  m.on('dragend', () => (draggedAt = Date.now()));
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Date.now() - draggedAt < 400) return;
    showStartCard(which);
  });
}

function showOrigin() {
  if (!state.origin) {
    marker.remove();
    marker2.remove();
    meetChip.hidden = true;
    hint.hidden = !$('search').hidden;
    return;
  }
  marker.setLngLat([state.origin.lon, state.origin.lat]).addTo(map);
  if (state.second) marker2.setLngLat([state.second.lon, state.second.lat]).addTo(map);
  else marker2.remove();
  meetChip.hidden = !state.second;
  hint.hidden = true;
}

function setOrigin(lat: number, lon: number) {
  state.origin = { lat, lon };
  showOrigin();
  hideReadout();
  writeUrl();
  compute();
}

/** Removes a start; without the first, the second (if any) becomes the start. */
function removeStart(which: 1 | 2) {
  if (which === 1) {
    state.origin = state.second;
    state.second = null;
  } else state.second = null;
  showOrigin();
  hideReadout();
  writeUrl();
  if (state.origin) compute();
  else clearResult();
}

/** No start: drop the colours, lines and outlines. */
function clearResult() {
  state.requestId++;
  lastResult = null;
  renderMeet(undefined);
  loadbar.hidden = true;
  setStatus(() => '');
  renderFavourites();
  showLegend(false);
  if (!mapReady) return;
  if (map.getLayer(HEAT_LAYER)) map.setLayoutProperty(HEAT_LAYER, 'visibility', 'none');
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  for (const id of [ROUTES_SOURCE, LABELS_SOURCE, OUTLINES_SOURCE])
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(empty);
}

/** Meeting point on (a second start) or off (null). */
function setSecond(p: { lat: number; lon: number } | null) {
  state.second = p;
  showOrigin();
  hideReadout();
  writeUrl();
  compute();
}

let mapReady = false;
map.on('load', () => {
  mapReady = true;
  // Start with the attribution collapsed to its (i) button so it does not cover the legend.
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
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
  const font = textFont();
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
  const visibility = state.routes ? 'visible' : 'none';
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
  map.addSource(DESERT_SOURCE, {
    type: 'canvas',
    canvas: desertCanvas,
    coordinates: [
      [13.08, 52.68],
      [13.77, 52.68],
      [13.77, 52.33],
      [13.08, 52.33],
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
  const isoVisibility = state.iso ? 'visible' : 'none';
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
      'text-field': outlineLabel(false),
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
  // The connection to a tapped spot: rides in their line colours, walks dashed.
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
    filter: ['==', ['get', 'walk'], true],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#1d1530', 'line-width': 3, 'line-dasharray': [0.4, 1.6] },
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
  if (lastResult) showResult(lastResult);
  showLayers();
});

/** Shows or hides the stop-frequency and desert layers, asking the worker for data once. */
function showLayers() {
  layerLegend.hidden = !(state.freq || state.desert);
  renderLayerLegend();
  if (!mapReady) return;
  const data = layerData[state.window];
  if ((state.freq || state.desert) && !data && !layersRequested.has(state.window)) {
    layersRequested.add(state.window);
    send({
      type: 'layers',
      window: state.window,
      thresholds: desertThresholds(state.when),
      walkKmh: state.walkKmh,
    });
  }
  map.setLayoutProperty(STATIONS_LAYER, 'visibility', state.freq && data ? 'visible' : 'none');
  map.setLayoutProperty(DESERT_LAYER, 'visibility', state.desert && data ? 'visible' : 'none');
  if (!data) return;
  (map.getSource(STATIONS_SOURCE) as GeoJSONSource).setData(data.stations);
  const { width, height, rgba } = data.desert.image;
  desertCanvas.width = width;
  desertCanvas.height = height;
  desertCanvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const src = map.getSource(DESERT_SOURCE) as CanvasSource;
  src.setCoordinates(cornerCoordinates(data.desert.bbox));
  src.play();
  src.pause();
  map.triggerRepaint();
}

function cornerCoordinates([w, s, e, n]: [number, number, number, number]) {
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ] as [[number, number], [number, number], [number, number], [number, number]];
}

function renderLayerLegend() {
  const rows: string[] = [];
  if (state.freq) {
    const labels = ['<4', '4', '12', '30', '60+'];
    rows.push(
      `<div class="ll-row"><span class="ll-title">${t('freqLegend')}</span>${FREQ_COLORS.map(
        (c, i) => `<span class="ll-dot" style="background:${c}"></span><span>${labels[i]}</span>`,
      ).join('')}</div>`,
    );
  }
  if (state.desert) {
    const [a, b] = desertThresholds(state.when).map((x) => x / 60);
    rows.push(
      `<div class="ll-row"><span class="ll-title">${t('desertLegend')}</span>` +
        `<span class="ll-box ll-light"></span><span>&gt;${a}</span>` +
        `<span class="ll-box ll-strong"></span><span>&gt;${b} ${t('min')}</span></div>`,
    );
  }
  layerLegend.innerHTML = rows.join('');
}

/** A font the basemap's glyph server has, taken from its own labels. */
function textFont(): string[] {
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol') continue;
    const f = map.getLayoutProperty(l.id, 'text-font') as unknown;
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) return f as string[];
  }
  return ['Noto Sans Regular'];
}

/** The chosen opacity in the city view, fading at street level so names and numbers read. */
function heatOpacity(): maplibregl.ExpressionSpecification {
  const o = state.opacity / 100;
  return ['interpolate', ['linear'], ['zoom'], 13, o, 16, o * 0.45];
}

// ---------- suggested meeting points ----------
let meetMarkers: maplibregl.Marker[] = [];
/** Pins for the suggested meeting points; a tap shows both trips there. */
function renderMeet(list: Result['meet']) {
  for (const m of meetMarkers) m.remove();
  meetMarkers = (list ?? []).map((s, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'meet-marker';
    el.innerHTML = `<i>${i + 1}</i><span>${escapeHtml(shortStop(s.name))}</span>`;
    el.title = t('meetSuggestion', { name: stopName(s.name), a: s.a, b: s.b });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      tapAt(s.lat, s.lon, undefined, stopName(s.name));
    });
    return new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
  });
}
// In the city view the pins show just their number, so they do not cover each other.
const MEET_NAMES_ZOOM = 12.5;
const showMeetNames = () =>
  map.getContainer().classList.toggle('meet-names', map.getZoom() >= MEET_NAMES_ZOOM);
map.on('zoomend', showMeetNames);
showMeetNames();

/** Outline labels: "15 min", or "+15 min" (extra minutes) at a meeting point. */
function outlineLabel(extra: boolean): maplibregl.ExpressionSpecification {
  return ['concat', extra ? '+' : '', ['to-string', ['get', 'min']], ' min'];
}

function showResult(r: Result) {
  renderMeet(r.meet);
  renderFavourites();
  showLegend(!!r.compare, r.extraBase !== undefined);
  if (!mapReady) return;
  const { width, height, rgba } = r.image;
  heatCanvas.width = width;
  heatCanvas.height = height;
  heatCanvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const [w, s, e, n] = r.bbox;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
  const src = map.getSource(HEAT_SOURCE) as CanvasSource | undefined;
  if (!src) {
    map.addSource(HEAT_SOURCE, {
      type: 'canvas',
      canvas: heatCanvas,
      coordinates,
      animate: false,
    });
    map.addLayer(
      {
        id: HEAT_LAYER,
        type: 'raster',
        source: HEAT_SOURCE,
        paint: {
          'raster-opacity': heatOpacity(),
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
        },
      },
      DESERT_LAYER,
    );
  } else {
    map.setLayoutProperty(HEAT_LAYER, 'visibility', 'visible');
    src.setCoordinates(coordinates);
    // A non-animated canvas source re-reads its canvas only while "playing".
    src.play();
    src.pause();
  }
  (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData(r.routes);
  (map.getSource(LABELS_SOURCE) as GeoJSONSource | undefined)?.setData(r.labels);
  (map.getSource(OUTLINES_SOURCE) as GeoJSONSource | undefined)?.setData(r.outlines);
  if (map.getLayer('outlines-label'))
    map.setLayoutProperty('outlines-label', 'text-field', outlineLabel(r.extraBase !== undefined));
  map.triggerRepaint();
}

function gridSeconds(r: RasterLayer, lat: number, lon: number, values = r.grid.seconds): number {
  const [w, s, e, n] = r.bbox;
  const { cols, rows } = r.grid;
  const c = Math.floor(((lon - w) / (e - w)) * cols);
  const row = Math.floor(((n - lat) / (n - s)) * rows);
  if (c < 0 || c >= cols || row < 0 || row >= rows) return Infinity;
  return values[row * cols + c];
}

// A tap that only closes the search panel should not also set a point.
let ignoreClick = false;
map.on('click', (e: MapMouseEvent) => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  tapAt(e.lngLat.lat, e.lngLat.lng, e.point);
});

/**
 * The card for a spot: minutes, line, access time and the trip there. `at` is the spot on
 * screen, for picking up a station dot or line under the finger; `title` names the spot
 * (a meeting-point suggestion or a search result).
 */
function tapAt(
  lat: number,
  lng: number,
  at?: { x: number; y: number },
  title = '',
  searched = false,
) {
  const near = (layers: string[]) =>
    at
      ? map.queryRenderedFeatures(
          [
            [at.x - 8, at.y - 8],
            [at.x + 8, at.y + 8],
          ],
          { layers },
        )
      : [];
  const data = layerData[state.window];
  const station = state.freq && data ? near([STATIONS_LAYER])[0] : undefined;
  let html: string;
  if (station) {
    const p = station.properties as StationProps;
    html =
      t('stationFreq', { name: escapeHtml(p.name), n: p.perHour }) +
      (p.lines ? `<small>${escapeHtml(p.lines)}</small>` : '');
  } else if (!state.origin && !(state.desert && data)) {
    setOrigin(lat, lng);
    return;
  } else {
    const r = lastResult;
    const secs = r && state.origin ? gridSeconds(r, lat, lng) : NaN;
    const parts: string[] = [];
    let tripSlot = '';
    if (secs >= 0 && r?.compare) {
      const b = gridSeconds(r, lat, lng, r.compare);
      const fmt = (v: number) => (v < Infinity ? String(Math.round(v / 60)) : '–');
      const d = Math.round(b / 60) - Math.round(secs / 60);
      parts.push(
        t('cmpMinutes', {
          a: fmt(secs),
          b: fmt(b),
          d: Number.isFinite(d) ? (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0') : '–',
        }) + `<small>${whenText(state.when)} → ${whenText(state.compare!)}</small>`,
      );
    } else if (secs === Infinity) parts.push(t('unreachable'));
    else if (secs >= 0 && r?.each) {
      const [a, b] = r.each.map((v) => gridSeconds(r, lat, lng, v) / 60);
      parts.push(t('minutesBoth', { a: Math.round(a), b: Math.round(b) }));
      if (r.extraBase !== undefined)
        parts.push(
          `<small>${t('extraMinutes', { n: Math.max(0, Math.round((secs - r.extraBase) / 60)) })}</small>`,
        );
    } else if (secs >= 0) parts.push(t('minutes', { n: Math.round(secs / 60) }));
    if (state.routes && state.origin) {
      const top = near(['routes-line']).sort((a, b) => b.properties.share - a.properties.share)[0];
      if (top) {
        const pct = Math.round(100 * (top.properties.share as number));
        parts.push(
          `<small>${t('lineShare', { names: escapeHtml(String(top.properties.names)), pct })}</small>`,
        );
      }
    }
    // The connection itself arrives from the worker a moment later.
    if (secs < Infinity && r) {
      state.tripId++;
      send({ type: 'trip', id: state.tripId, lat, lon: lng });
      tripSlot = '<span id="trip" class="trip"></span>';
    }
    if (state.desert && data) {
      const access = gridSeconds(data.desert, lat, lng);
      parts.push(
        access === Infinity ? t('accessNone') : t('access', { n: Math.round(access / 60) }),
      );
    }
    html = parts.join('<br>') + tripSlot;
  }
  if (title) html = `<b class="spot-name">${escapeHtml(title)}</b>${html}`;
  showReadoutCard(html, false, searched);
  state.pending = { lat, lon: lng };
  secondBtn.hidden = !state.origin;
  if (!title && map.getZoom() >= 15) showAddress(state.pending);
  if (tipKey === 'tap') hideTip();
}

/**
 * At street level, names the address under the tap; "Hier starten" then starts there, so the
 * start sits on the house rather than a few metres off it.
 */
async function showAddress(at: { lat: number; lon: number }) {
  let place: Place | null = null;
  try {
    place = await reverseAddress(at, lang());
  } catch {
    return; // Offline or Photon down: the card works without it.
  }
  if (!place || state.pending !== at || readout.hidden) return;
  // Only snap to an address close to the tap (about 60 m).
  const dy = (place.lat - at.lat) * 111_000;
  const dx = (place.lon - at.lon) * 111_000 * Math.cos((at.lat * Math.PI) / 180);
  if (Math.hypot(dx, dy) > 60) return;
  const el = document.createElement('small');
  el.className = 'addr';
  el.textContent = place.label;
  readoutText.prepend(el);
  state.pending = { lat: place.lat, lon: place.lon };
}

const removeBtn = $<HTMLButtonElement>('readout-remove');
let removeWhich: 1 | 2 = 1;
/** The card at the bottom: minutes for a spot, or a start point with a remove button. */
function showReadoutCard(html: string, start: boolean, searched = false) {
  readoutText.innerHTML = html;
  // A search result offers "Neuer Start" next to "2. Start"; the trip shown is the "Ziel".
  $('readout-start').textContent = t(searched ? 'newStart' : 'startHere');
  for (const id of ['readout-start', 'readout-second', 'readout-fav']) $(id).hidden = start;
  removeBtn.hidden = !start;
  readout.hidden = false;
}
function showStartCard(which: 1 | 2) {
  hideReadout();
  removeWhich = which;
  const mark = state.second ? `<i class="p${which}"></i>` : '';
  showReadoutCard(`${mark}<b>${t(which === 1 ? 'startPoint' : 'secondPoint')}</b>`, true);
  if (tipKey === 'tap') hideTip();
}
removeBtn.addEventListener('click', () => removeStart(removeWhich));

function hideReadout() {
  readout.hidden = true;
  state.tripId++;
  setTrip(null);
}

type Trip = Extract<FromWorker, { type: 'trip' }>;
/** Draws a journey (or clears it); while one is shown the Lines layer steps back. */
function setTrip(trip: Pick<Trip, 'lines' | 'stops'> | null) {
  if (!mapReady) return;
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  (map.getSource(TRIP_SOURCE) as GeoJSONSource | undefined)?.setData(trip?.lines ?? empty);
  (map.getSource(TRIP_STOPS_SOURCE) as GeoJSONSource | undefined)?.setData(trip?.stops ?? empty);
  map.setPaintProperty('routes-line', 'line-opacity', trip ? 0.3 : 1);
  map.setPaintProperty('routes-casing', 'line-opacity', trip ? 0.2 : 0.9);
  map.setLayoutProperty('routes-label', 'visibility', state.routes && !trip ? 'visible' : 'none');
}

/** The journey to the tapped spot: changes and walking, then one row per ride. */
function showTrip(m: Extract<FromWorker, { type: 'trip' }>) {
  const el = document.getElementById('trip');
  if (!el) return;
  const two = m.journeys.length > 1;
  const starts = [state.origin, state.second];
  const here = state.pending;
  el.innerHTML = m.journeys
    .map((j, i) => {
      const mark = two ? `<i class="p${i + 1}"></i>` : '';
      if (!j) return `<span class="trip-sum">${mark}${t('tripNone')}</span>`;
      const walk = j.legs.reduce((a, l) => a + (l.type === 'walk' ? l.minutes : 0), 0);
      const rides = j.legs.filter((l) => l.type === 'ride');
      const badges = rides
        .map(
          (l) =>
            `<span class="line-badge" style="background:${MODE_COLORS[l.mode] ?? '#444'}">${escapeHtml(l.name)}</span>`,
        )
        .join('<span class="trip-sep">›</span>');
      const sum = [
        rides.length
          ? t(j.transfers === 0 ? 'noTransfer' : j.transfers === 1 ? 'oneTransfer' : 'transfers', {
              n: j.transfers,
            })
          : '',
        walk ? t('tripWalk', { n: walk }) : '',
      ].filter(Boolean);
      // Stops where you get on, change and get off.
      const stops = rides.length
        ? [rides[0].from, ...rides.map((l) => l.to)].map((n) => escapeHtml(shortStop(n)))
        : [];
      const start = starts[i];
      const link =
        start && here
          ? `<a class="trip-link" href="${googleTransit(
              state.direction === 'depart' ? start : here,
              state.direction === 'depart' ? here : start,
            )}" target="_blank" rel="noopener">${t('openGoogle')}</a>`
          : '';
      return (
        `<span class="trip-sum">${mark}${badges}${link}</span>` +
        `<small class="trip-stops">${[sum.join(' · '), stops.join(' → ')].filter(Boolean).join(' · ')}</small>`
      );
    })
    .join('');
  setTrip(m);
}

/** Google Maps public-transport directions; opens the app on phones. */
function googleTransit(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const p = (o: { lat: number; lon: number }) => `${o.lat.toFixed(5)},${o.lon.toFixed(5)}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${p(from)}&destination=${p(to)}&travelmode=transit`;
}

/** VBB names carry the town: "U Hermannplatz (Berlin)", "Berlin, Greifswalder Str." */
const stopName = (n: string) => n.replace(/ \(Berlin\)$/, '').replace(/^Berlin, /, '');
/** Shorter still for the stop chain: "S+U Alexanderplatz Bhf" -> "Alexanderplatz". */
const shortStop = (n: string) =>
  stopName(n)
    .replace(/^(S\+U|S|U) /, '')
    .replace(/ Bhf\b/, '');

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

$('readout-start').addEventListener('click', () => {
  if (state.pending) setOrigin(state.pending.lat, state.pending.lon);
});
secondBtn.addEventListener('click', () => {
  if (state.pending) setSecond(state.pending);
});
$('readout-fav').addEventListener('click', async () => {
  const at = state.pending;
  if (!at) return;
  hideReadout();
  let label = `${at.lat.toFixed(4)}, ${at.lon.toFixed(4)}`;
  try {
    label = (await reversePlace(at, lang())) ?? label;
  } catch {
    // Offline or Photon down: keep the coordinates as the name.
  }
  addFavourites([{ label, ...at }]);
});
$('meet-close').addEventListener('click', () => removeStart(2));

// ---------- controls ----------
/** "werktags ab 10 Uhr" / "weekends from 02:00", for the tap readout. */
function whenText(w: When) {
  if (state.direction === 'arrive')
    return t(w.day === 'weekday' ? 'onWeekdaysArr' : 'onWeekendsArr', {
      hour: hourLabel(w.hour),
      next: hourLabel((w.hour + 1) % 24),
    });
  return t(w.day === 'weekday' ? 'onWeekdays' : 'onWeekends', { hour: hourLabel(w.hour) });
}
const hourLabel = (h: number) =>
  lang() === 'de' ? `${h} Uhr` : `${String(h).padStart(2, '0')}:00`;
const clockLabel = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` + (lang() === 'de' ? ' Uhr' : '');

/**
 * "Nächste" leaves now when the chosen hour is the current one in Berlin, otherwise on
 * the hour: seconds into the chosen hour.
 */
function leaveOffset(): number {
  const now = new Date();
  const w = whenAt(now);
  if (w.day !== state.when.day || w.hour !== state.when.hour) return 0;
  // Berlin is a whole number of hours from UTC, so minutes and seconds match.
  return now.getUTCMinutes() * 60 + now.getUTCSeconds();
}

function renderWhen() {
  const w = state.when;
  const arrive = state.direction === 'arrive';
  const pill =
    w.day === 'weekday'
      ? arrive
        ? 'weekdayArr'
        : 'weekdayAt'
      : arrive
        ? 'weekendArr'
        : 'weekendAt';
  const offset = !arrive && state.measure === 'next' ? leaveOffset() : 0;
  whenBtn.querySelector('span')!.textContent = t(pill, {
    hour: offset ? clockLabel(w.hour, Math.floor(offset / 60)) : hourLabel(w.hour),
  });
  $('when-hour').textContent = t(arrive ? 'whenHourArr' : 'whenHour');
  for (const b of dirButtons)
    b.setAttribute('aria-checked', String(b.dataset.dir === state.direction));
  for (const b of measureButtons)
    b.setAttribute('aria-checked', String(b.dataset.measure === state.measure));
  $('measure-note').textContent = t(
    state.measure === 'best'
      ? 'measureNoteBest'
      : state.measure === 'next'
        ? arrive
          ? 'measureNoteNextArr'
          : 'measureNoteNext'
        : arrive
          ? 'measureNoteTypicalArr'
          : 'measureNoteTypical',
  );
  const c = state.compare;
  cmpDay.value = c?.day ?? '';
  cmpHour.disabled = !c;
  if (cmpHour.options.length !== 24)
    cmpHour.replaceChildren(
      ...Array.from({ length: 24 }, (_, h) => new Option(hourLabel(h), String(h))),
    );
  for (const o of cmpHour.options) o.textContent = hourLabel(Number(o.value));
  cmpHour.value = String(c?.hour ?? w.hour);
  cmpChip.hidden = !c;
  if (c)
    $('cmp-text').textContent = t('compareChip', {
      a: whenBtn.querySelector('span')!.textContent ?? '',
      b: t(
        c.day === 'weekday'
          ? arrive
            ? 'weekdayArr'
            : 'weekdayAt'
          : arrive
            ? 'weekendArr'
            : 'weekendAt',
        {
          hour: hourLabel(c.hour),
        },
      ),
    });
  for (const b of dayButtons) b.setAttribute('aria-checked', String(b.dataset.day === w.day));
  for (const b of hourGrid.children)
    b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.hour) === w.hour));
}

function setWhen(
  w: When,
  more: Partial<Pick<typeof state, 'direction' | 'measure' | 'compare'>> = {},
) {
  Object.assign(state, more);
  state.when = w;
  state.window = windowName(w);
  renderWhen();
  hideReadout();
  renderFeedInfo();
  writeUrl();
  showLayers();
  if (state.origin) compute();
  else send({ type: 'load', window: computedWindow() });
}
hourGrid.append(
  ...Array.from({ length: 24 }, (_, h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.hour = String(h);
    b.textContent = String(h);
    b.addEventListener('click', () => {
      setWhen({ ...state.when, hour: h });
      whenDialog.close();
    });
    return b;
  }),
);
for (const b of dayButtons)
  b.addEventListener('click', () => setWhen({ ...state.when, day: b.dataset.day as DayType }));
for (const b of dirButtons)
  b.addEventListener('click', () => setWhen(state.when, { direction: b.dataset.dir as Direction }));
for (const b of measureButtons)
  b.addEventListener('click', () => setWhen(state.when, { measure: b.dataset.measure as Measure }));
const readCompare = (): When | null =>
  cmpDay.value ? { day: cmpDay.value as DayType, hour: Number(cmpHour.value) } : null;
cmpDay.addEventListener('change', () => {
  // Turning it on for the same day suggests the other end of it: night by day, 10 Uhr by night.
  const c = readCompare();
  if (c && !state.compare && c.day === state.when.day) c.hour = state.when.hour >= 5 ? 2 : 10;
  setWhen(state.when, { compare: c });
});
cmpHour.addEventListener('change', () => setWhen(state.when, { compare: readCompare() }));
$('cmp-close').addEventListener('click', () => setWhen(state.when, { compare: null }));
whenBtn.addEventListener('click', () => {
  closeSearch();
  hideReadout();
  whenDialog.showModal();
});
$('when-close').addEventListener('click', () => whenDialog.close());
setWhen(state.when);
showOrigin();

function setRoutes(on: boolean) {
  state.routes = on;
  routesToggle.checked = on;
  if (mapReady) {
    for (const id of ROUTE_LAYERS) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
  writeUrl();
}
routesToggle.addEventListener('change', () => setRoutes(routesToggle.checked));
routesToggle.checked = state.routes;

function setLayer(name: 'freq' | 'desert', on: boolean) {
  state[name] = on;
  hideReadout();
  showLayers();
  writeUrl();
}
freqToggle.addEventListener('change', () => setLayer('freq', freqToggle.checked));
desertToggle.addEventListener('change', () => setLayer('desert', desertToggle.checked));
freqToggle.checked = state.freq;
desertToggle.checked = state.desert;

function setIso(on: boolean) {
  state.iso = on;
  if (mapReady) {
    for (const id of OUTLINE_LAYERS)
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
  writeUrl();
}
isoToggle.addEventListener('change', () => setIso(isoToggle.checked));
isoToggle.checked = state.iso;

opacityInput.value = String(state.opacity);
opacityInput.addEventListener('input', () => {
  state.opacity = Number(opacityInput.value);
  remember('heat-opacity', opacityInput.value);
  if (map.getLayer(HEAT_LAYER)) map.setPaintProperty(HEAT_LAYER, 'raster-opacity', heatOpacity());
});

function renderWalk() {
  for (const b of walkButtons)
    b.setAttribute('aria-checked', String(Number(b.dataset.walk) === state.walkKmh));
}
for (const b of walkButtons)
  b.addEventListener('click', () => {
    const kmh = Number(b.dataset.walk);
    if (kmh === state.walkKmh) return;
    state.walkKmh = kmh;
    remember('walk-kmh', String(kmh));
    renderWalk();
    writeUrl();
    redoWalks();
  });
renderWalk();

// "Nächste" follows the clock: coming back to the app recomputes from the new "now".
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || state.measure !== 'next') return;
  renderWhen();
  compute();
});

// ---------- my location ----------
locateBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    setStatus(() => t('locateFailed'));
    return;
  }
  closeSearch();
  locateBtn.classList.add('busy');
  setStatus(() => t('locating'));
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locateBtn.classList.remove('busy');
      const [w, s, e, n] = SEARCH_BBOX;
      const { latitude: lat, longitude: lon } = coords;
      if (lon < w || lon > e || lat < s || lat > n) {
        setStatus(() => t('locateOutside'));
        return;
      }
      setOrigin(lat, lon);
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
    },
    (err) => {
      locateBtn.classList.remove('busy');
      setStatus(() => t(err.code === err.PERMISSION_DENIED ? 'locateDenied' : 'locateFailed'));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
});

// ---------- share ----------
$('share-btn').addEventListener('click', async () => {
  // A shared map keeps its time, even when that is the current one here.
  const shared = new URL(location.href);
  shared.searchParams.set('t', state.window);
  const url = shared.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: t('title'), text: t('shareText'), url });
      menuDialog.close();
    } catch {
      // Cancelled by the user.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    menuDialog.close();
    setStatus(() => t('linkCopied'), true);
  } catch {
    prompt(t('share'), url);
  }
});

// ---------- hints: first use, then installing the app ----------
type InstallEvent = Event & { prompt: () => Promise<void> };
let installEvent: InstallEvent | null = null;
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
let tipKey = '';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e as InstallEvent;
  installBtn.hidden = false;
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  installBtn.hidden = true;
  if (tipKey === 'install') hideTip();
});
async function install() {
  if (!installEvent) return;
  await installEvent.prompt().catch(() => {});
  installEvent = null;
  installBtn.hidden = true;
  hideTip();
}
installBtn.addEventListener('click', () => {
  menuDialog.close();
  void install();
});

/** One hint at a time: how to read the map on first use, on a later visit how to install. */
function showTips() {
  if (!tip.hidden) return;
  if (!seen('tap')) showTip('tap');
  else if (!seen('install') && !standalone() && (installEvent || isIos)) showTip('install');
}
function showTip(key: 'tap' | 'install') {
  tipKey = key;
  renderTip();
  tip.hidden = false;
  // A hint counts as seen once shown, so it never comes back on the next visit.
  remember(`seen-${key}`, '1');
}
function renderTip() {
  if (!tipKey) return;
  tipText.textContent = t(
    tipKey === 'tap' ? 'tipTap' : installEvent ? 'tipInstall' : 'tipInstallIos',
  );
  tipAction.hidden = !(tipKey === 'install' && installEvent);
  tipAction.textContent = t('installNow');
}
function hideTip() {
  tip.hidden = true;
  tipKey = '';
}
$('tip-close').addEventListener('click', hideTip);
tipAction.addEventListener('click', () => void install());

// ---------- menu and language ----------
$('menu-btn').addEventListener('click', () => {
  closeSearch();
  hideReadout();
  menuDialog.showModal();
});
$('menu-close').addEventListener('click', () => menuDialog.close());
$('about-btn').addEventListener('click', () => {
  menuDialog.close();
  infoDialog.showModal();
});
// A tap on the backdrop (outside the panel) closes either sheet.
for (const d of [menuDialog, infoDialog, whenDialog]) {
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
}

function applyLang(l: Lang, remember: boolean) {
  setLang(l, remember);
  for (const b of langButtons) b.setAttribute('aria-checked', String(b.dataset.lang === l));
  renderFeedInfo();
  renderLayerLegend();
  renderFavourites();
  renderWhen();
  renderTip();
  statusEl.textContent = state.status();
  hideReadout();
  searchCache.clear();
}
for (const b of langButtons)
  b.addEventListener('click', () => {
    applyLang(b.dataset.lang as Lang, true);
    writeUrl();
  });

// ---------- address search ----------
const searchBtn = $<HTMLButtonElement>('search-btn');
const searchPanel = $('search');
const searchInput = $<HTMLInputElement>('search-input');
const searchResults = $<HTMLUListElement>('search-results');
const searchMsg = $('search-msg');
let searchTimer = 0;
let searchAbort: AbortController | null = null;
let places: Place[] = [];
let active = -1;
const searchCache = new Map<string, Place[]>();

function openSearch() {
  searchPanel.hidden = false;
  hideReadout();
  hint.hidden = true;
  searchInput.focus();
  searchInput.select();
}
function closeSearch() {
  searchPanel.hidden = true;
  hint.hidden = !!state.origin;
  searchAbort?.abort();
  clearTimeout(searchTimer);
  searchInput.blur();
}
function showMsg(text: string) {
  searchMsg.textContent = text;
  searchMsg.hidden = !text;
}
function renderPlaces(list: Place[]) {
  places = list;
  active = -1;
  searchResults.replaceChildren(
    ...list.map((p, i) => {
      const li = document.createElement('li');
      li.id = `place-${i}`;
      li.setAttribute('role', 'option');
      const b = document.createElement('b');
      b.textContent = p.label;
      li.append(b);
      if (p.detail) {
        const s = document.createElement('span');
        s.textContent = p.detail;
        li.append(s);
      }
      // pointerdown fires before the input loses focus, so the list stays put on phones.
      li.addEventListener('pointerdown', (e) => e.preventDefault());
      li.addEventListener('click', () => pickPlace(p));
      return li;
    }),
  );
  searchResults.hidden = list.length === 0;
  searchInput.setAttribute('aria-expanded', String(list.length > 0));
  searchInput.removeAttribute('aria-activedescendant');
}
function setActive(i: number) {
  if (!places.length) return;
  active = (i + places.length) % places.length;
  [...searchResults.children].forEach((li, j) =>
    li.setAttribute('aria-selected', String(j === active)),
  );
  searchInput.setAttribute('aria-activedescendant', `place-${active}`);
  searchResults.children[active]?.scrollIntoView({ block: 'nearest' });
}

async function runSearch(q: string) {
  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached) {
    renderPlaces(cached);
    showMsg(cached.length ? '' : t('noMatches'));
    return;
  }
  searchAbort?.abort();
  const ctrl = (searchAbort = new AbortController());
  const c = map.getCenter();
  try {
    const list = await searchPlaces(q, { lat: c.lat, lon: c.lng }, ctrl.signal, lang());
    searchCache.set(key, list);
    if (ctrl.signal.aborted) return;
    renderPlaces(list);
    showMsg(list.length ? '' : t('noMatches'));
  } catch {
    if (ctrl.signal.aborted) return;
    renderPlaces([]);
    showMsg(t(navigator.onLine ? 'searchDown' : 'searchOffline'));
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 3) {
    searchAbort?.abort();
    renderPlaces([]);
    showMsg('');
    return;
  }
  searchTimer = window.setTimeout(() => runSearch(q), 250);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') setActive(active + 1);
  else if (e.key === 'ArrowUp') setActive(active - 1);
  else if (e.key === 'Escape') closeSearch();
  else if (e.key === 'Enter') {
    const p = places[Math.max(active, 0)];
    if (p) pickPlace(p);
    else if (searchInput.value.trim().length >= 3) {
      clearTimeout(searchTimer);
      runSearch(searchInput.value.trim());
    }
  } else return;
  e.preventDefault();
});

/** What a picked search result does: set the start, or add a favourite place. */
let searchFor: 'start' | 'favourite' = 'start';
function pickPlace(p: Place) {
  closeSearch();
  if (searchFor === 'favourite') {
    searchFor = 'start';
    searchInput.value = '';
    addFavourites([{ label: p.label, lat: p.lat, lon: p.lon }]);
    menuDialog.showModal();
    return;
  }
  searchInput.value = p.label;
  map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
  // With a start set, the place may be a new start, a destination or a second start:
  // show the trip there, with buttons for the other two.
  if (state.origin && lastResult) tapAt(p.lat, p.lon, undefined, p.label, true);
  else setOrigin(p.lat, p.lon);
}

searchBtn.addEventListener('click', () => {
  searchFor = 'start';
  if (searchPanel.hidden) openSearch();
  else closeSearch();
});
$('search-close').addEventListener('click', closeSearch);
for (const ev of ['mousedown', 'touchstart'] as const) {
  map.on(ev, () => {
    ignoreClick = !searchPanel.hidden;
    if (ignoreClick) closeSearch();
  });
}

// ---------- favourite places ----------
let favourites = loadFavourites();
const favMarkers = new Map<string, maplibregl.Marker>();

function addFavourites(places: { label: string; lat: number; lon: number }[]) {
  favourites = [
    ...favourites,
    ...places.map((p) => ({
      id: newId(),
      label: p.label,
      lat: p.lat,
      lon: p.lon,
      weight: 2 as Weight,
    })),
  ];
  saveFavourites(favourites);
  renderFavourites();
}

function favouriteTimes() {
  const r = lastResult;
  return r && state.origin ? score(favourites, (lat, lon) => gridSeconds(r, lat, lon)) : null;
}

/** Redraws the list in the menu, the star markers on the map and the score chip. */
function renderFavourites() {
  const times = favouriteTimes();
  favList.replaceChildren(
    ...favourites.map((f, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'fav-name';
      name.textContent = f.label;
      const min = document.createElement('span');
      min.className = 'fav-min';
      const m = times?.minutes[i];
      min.textContent = times ? (m === null ? '–' : `${m} ${t('min')}`) : '';
      const weight = document.createElement('select');
      weight.setAttribute('aria-label', t('favWeight'));
      for (const w of WEIGHTS) {
        const o = document.createElement('option');
        o.value = String(w);
        o.textContent = t(`weight${w}` as const);
        o.selected = f.weight === w;
        weight.append(o);
      }
      weight.addEventListener('change', () => {
        f.weight = Number(weight.value) as Weight;
        saveFavourites(favourites);
        renderFavourites();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'fav-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', t('favRemove', { name: f.label }));
      del.addEventListener('click', () => {
        favourites = favourites.filter((x) => x !== f);
        saveFavourites(favourites);
        renderFavourites();
      });
      li.append(name, min, weight, del);
      return li;
    }),
  );
  $('fav-empty').hidden = favourites.length > 0;
  $('fav-export').hidden = favourites.length === 0;

  const keep = new Set(favourites.map((f) => f.id));
  for (const [id, m] of favMarkers) {
    if (!keep.has(id)) {
      m.remove();
      favMarkers.delete(id);
    }
  }
  favourites.forEach((f, i) => {
    let m = favMarkers.get(f.id);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'fav-marker';
      m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([f.lon, f.lat])
        .addTo(map);
      favMarkers.set(f.id, m);
    }
    const mins = times?.minutes[i];
    m.getElement().textContent = times ? `★ ${mins === null ? '–' : mins}` : '★';
    m.getElement().title = f.label;
  });

  favChip.hidden = !(times && times.average !== null);
  if (times?.average != null) {
    favChip.textContent = t('favScore', { n: times.average, count: favourites.length });
  }
}

favChip.addEventListener('click', () => {
  menuDialog.showModal();
  $('fav-title').scrollIntoView({ block: 'start' });
});
$('fav-add').addEventListener('click', () => {
  menuDialog.close();
  searchFor = 'favourite';
  openSearch();
});
const favFile = $<HTMLInputElement>('fav-file');
$('fav-import').addEventListener('click', () => favFile.click());
favFile.addEventListener('change', async () => {
  const file = favFile.files?.[0];
  favFile.value = '';
  if (!file) return;
  const msg = $('fav-msg');
  try {
    const places = parseImport(await file.text());
    const found: { label: string; lat: number; lon: number }[] = [];
    let missing = 0;
    for (const [i, p] of places.entries()) {
      msg.textContent = t('favImporting', { i: i + 1, n: places.length });
      if (p.lat !== undefined && p.lon !== undefined) {
        found.push({ label: p.label, lat: p.lat, lon: p.lon });
        continue;
      }
      // No position in the file: look the name up, one request at a time to be kind to Photon.
      const hit = (
        await searchPlaces(
          p.query ?? p.label,
          { lat: BERLIN[1], lon: BERLIN[0] },
          new AbortController().signal,
          lang(),
        ).catch(() => [] as Place[])
      )[0];
      if (hit) found.push({ label: p.label, lat: hit.lat, lon: hit.lon });
      else missing++;
      await new Promise((r) => setTimeout(r, 250));
    }
    addFavourites(found);
    msg.textContent = t('favImported', { n: found.length, missing });
  } catch {
    msg.textContent = t('favImportFailed');
  }
});
$('fav-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(favourites, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lieblingsorte.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
applyLang(lang(), false);

// ---------- PWA ----------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
