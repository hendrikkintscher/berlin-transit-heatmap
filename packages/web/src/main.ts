import maplibregl, { type CanvasSource, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { BAND_COLORS, BAND_EDGES_MIN, bandLabel } from './colors';
import { reversePlace, searchPlaces, type Place } from './search';
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
import { DESERT_THRESHOLDS } from './layers';
import type {
  FromWorker,
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
const HEAT_OPACITY = 0.7;

// Line colours roughly follow the usual Berlin map conventions.
const MODE_COLORS: Record<string, string> = {
  sbahn: '#00843d',
  ubahn: '#0a5ea8',
  tram: '#c8102e',
  bus: '#7b2d8e',
  regional: '#8a1c1c',
  ferry: '#0090c8',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const loadbar = $('loadbar');
const hint = $('hint');
const readout = $('readout');
const readoutText = $('readout-text');
const statusEl = $('status');
const feedInfo = $('feed-info');
const infoDialog = $<HTMLDialogElement>('info');
const segButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-window]')];
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

const state: {
  window: Window;
  origin: { lat: number; lon: number } | null;
  /** Meeting point: the second person's start. */
  second: { lat: number; lon: number } | null;
  pending: { lat: number; lon: number } | null;
  requestId: number;
  info: Partial<Record<Window, TimetableInfo>>;
  routes: boolean;
  /** Stop-frequency dots and transit-desert shading. */
  freq: boolean;
  desert: boolean;
  /** Re-renders the status line, so it follows a language switch. */
  status: () => string;
} = {
  window: 'day',
  origin: null,
  second: null,
  pending: null,
  requestId: 0,
  info: {},
  routes: true,
  freq: false,
  desert: false,
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
$('legend-ticks').append(
  ...[0, 10, 20, 30, 40, 50, 60, 120].map((m) => {
    const tick = document.createElement('span');
    const i = BAND_EDGES_MIN.indexOf(m);
    tick.style.left = `${(100 * i) / BAND_COLORS.length}%`;
    tick.textContent = String(m);
    if (m === 120) tick.dataset.t = 'legendMax';
    return tick;
  }),
);

function setStatus(render: () => string) {
  state.status = render;
  statusEl.textContent = render();
}

// ---------- worker ----------
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);
send({ type: 'init', dataBase: new URL('data/', document.baseURI).href });

worker.onmessage = (ev: MessageEvent<FromWorker>) => {
  const m = ev.data;
  if (m.type === 'progress') {
    if (m.window !== state.window) return;
    loadbar.hidden = false;
    loadbar.classList.toggle('indeterminate', !m.total || m.loaded > m.total);
    (loadbar.firstElementChild as HTMLElement).style.width = m.total
      ? `${Math.min(100, (100 * m.loaded) / m.total)}%`
      : '';
  } else if (m.type === 'loaded') {
    state.info[m.info.window] = m.info;
    if (m.info.window === state.window) loadbar.hidden = true;
    renderFeedInfo();
  } else if (m.type === 'result') {
    if (m.id !== state.requestId) return;
    lastResult = m;
    showResult(m);
    loadbar.hidden = true;
    const s = m.totalMs / 1000;
    setStatus(() => t('computed', { s: formatDecimal(s, 1) }));
    prefetchOtherWindow();
  } else if (m.type === 'layers') {
    layerData[m.window] = m;
    if (m.window === state.window) showLayers();
  } else if (m.type === 'error') {
    loadbar.hidden = true;
    setStatus(() => t('failed', { message: m.message }));
  }
};

// Only the visible window is downloaded on first load; once a heatmap is on screen,
// fetch the other one quietly so the Day/Night toggle is instant.
let prefetched = false;
function prefetchOtherWindow() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (prefetched || conn?.saveData) return;
  prefetched = true;
  const other: Window = state.window === 'day' ? 'night' : 'day';
  setTimeout(() => send({ type: 'load', window: other, quiet: true }), 1500);
}

function renderFeedInfo() {
  const i = state.info[state.window];
  feedInfo.textContent = i
    ? t('feedInfo', { date: i.serviceDate, version: i.feedVersion, stops: formatNumber(i.stops) })
    : t('feedLoading');
}

function compute() {
  if (!state.origin) return;
  state.requestId++;
  loadbar.hidden = false;
  loadbar.classList.add('indeterminate');
  setStatus(() => t('computing'));
  send({
    type: 'compute',
    id: state.requestId,
    window: state.window,
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
  state.origin = parsePoint(p.get('from'));
  state.second = state.origin ? parsePoint(p.get('with')) : null;
  if (p.get('w') === 'night') state.window = 'night';
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
  if (state.window === 'night') p.set('w', 'night');
  if (!state.routes) p.set('routes', '0');
  const layers = [state.freq && 'freq', state.desert && 'desert'].filter(Boolean).join(',');
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
  maxZoom: 17,
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

function showOrigin() {
  if (!state.origin) return;
  marker.setLngLat([state.origin.lon, state.origin.lat]).addTo(map);
  if (state.second) marker2.setLngLat([state.second.lon, state.second.lat]).addTo(map);
  else marker2.remove();
  meetChip.hidden = !state.second;
  hint.hidden = true;
}

function setOrigin(lat: number, lon: number) {
  state.origin = { lat, lon };
  showOrigin();
  readout.hidden = true;
  writeUrl();
  compute();
}

/** Meeting point on (a second start) or off (null). */
function setSecond(p: { lat: number; lon: number } | null) {
  state.second = p;
  showOrigin();
  readout.hidden = true;
  writeUrl();
  compute();
}

let mapReady = false;
map.on('load', () => {
  mapReady = true;
  // Start with the attribution collapsed to its (i) button so it does not cover the legend.
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
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
        'line-color': [
          'match',
          ['get', 'mode'],
          ...Object.entries(MODE_COLORS).flat(),
          '#444444',
        ] as unknown as maplibregl.ExpressionSpecification,
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
    ROUTE_LAYERS[0],
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
    send({ type: 'layers', window: state.window });
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
    const [a, b] = DESERT_THRESHOLDS[state.window].map((x) => x / 60);
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

function showResult(r: Result) {
  renderFavourites();
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
          'raster-opacity': HEAT_OPACITY,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
        },
      },
      DESERT_LAYER,
    );
  } else {
    src.setCoordinates(coordinates);
    // A non-animated canvas source re-reads its canvas only while "playing".
    src.play();
    src.pause();
  }
  (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData(r.routes);
  (map.getSource(LABELS_SOURCE) as GeoJSONSource | undefined)?.setData(r.labels);
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
  const { lat, lng } = e.lngLat;
  const { x, y } = e.point;
  const near = (layers: string[]) =>
    map.queryRenderedFeatures(
      [
        [x - 8, y - 8],
        [x + 8, y + 8],
      ],
      { layers },
    );
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
    const secs = lastResult && state.origin ? gridSeconds(lastResult, lat, lng) : NaN;
    const when = t(state.window === 'day' ? 'byDay' : 'atNight');
    const parts: string[] = [];
    if (secs === Infinity) parts.push(t('unreachable'));
    else if (secs >= 0 && lastResult?.each) {
      const [a, b] = lastResult.each.map((v) => gridSeconds(lastResult!, lat, lng, v) / 60);
      parts.push(t('minutesBoth', { a: Math.round(a), b: Math.round(b), when }));
    } else if (secs >= 0) parts.push(t('minutes', { n: Math.round(secs / 60), when }));
    if (state.routes && state.origin) {
      const top = near(['routes-line']).sort((a, b) => b.properties.share - a.properties.share)[0];
      if (top) {
        const pct = Math.round(100 * (top.properties.share as number));
        parts.splice(
          0,
          1,
          t('lineShare', { names: escapeHtml(String(top.properties.names)), pct }),
        );
      }
    }
    if (state.desert && data) {
      const access = gridSeconds(data.desert, lat, lng);
      parts.push(
        access === Infinity ? t('accessNone') : t('access', { n: Math.round(access / 60) }),
      );
    }
    html = parts.join('<br>');
  }
  readoutText.innerHTML = html;
  state.pending = { lat, lon: lng };
  secondBtn.hidden = !state.origin;
  readout.hidden = false;
});

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
  readout.hidden = true;
  let label = `${at.lat.toFixed(4)}, ${at.lon.toFixed(4)}`;
  try {
    label = (await reversePlace(at, lang())) ?? label;
  } catch {
    // Offline or Photon down: keep the coordinates as the name.
  }
  addFavourites([{ label, ...at }]);
});
$('meet-close').addEventListener('click', () => setSecond(null));

// ---------- controls ----------
function setWindow(w: Window) {
  state.window = w;
  for (const b of segButtons) b.setAttribute('aria-checked', String(b.dataset.window === w));
  readout.hidden = true;
  renderFeedInfo();
  writeUrl();
  showLayers();
  if (state.origin) compute();
  else send({ type: 'load', window: w });
}
for (const b of segButtons)
  b.addEventListener('click', () => setWindow(b.dataset.window as Window));
setWindow(state.window);
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
  readout.hidden = true;
  showLayers();
  writeUrl();
}
freqToggle.addEventListener('change', () => setLayer('freq', freqToggle.checked));
desertToggle.addEventListener('change', () => setLayer('desert', desertToggle.checked));
freqToggle.checked = state.freq;
desertToggle.checked = state.desert;

// ---------- menu and language ----------
$('menu-btn').addEventListener('click', () => {
  closeSearch();
  readout.hidden = true;
  menuDialog.showModal();
});
$('menu-close').addEventListener('click', () => menuDialog.close());
$('about-btn').addEventListener('click', () => {
  menuDialog.close();
  infoDialog.showModal();
});
// A tap on the backdrop (outside the panel) closes either sheet.
for (const d of [menuDialog, infoDialog]) {
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
  statusEl.textContent = state.status();
  readout.hidden = true;
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
  readout.hidden = true;
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
  setOrigin(p.lat, p.lon);
  map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
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
