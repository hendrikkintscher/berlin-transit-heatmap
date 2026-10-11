import maplibregl, { type CanvasSource, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { BAND_COLORS, BAND_EDGES_MIN, bandLabel } from './colors';
import { searchPlaces, type Place } from './search';
import type { FromWorker, TimetableInfo, ToWorker, Window } from './protocol';

const BERLIN: [number, number] = [13.405, 52.515];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const HEAT_SOURCE = 'heat';
const HEAT_LAYER = 'heat-raster';
const ROUTES_SOURCE = 'routes';
const LABELS_SOURCE = 'route-labels';
const ROUTE_LAYERS = ['routes-casing', 'routes-line', 'routes-label'];
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
const segButtons = [...document.querySelectorAll<HTMLButtonElement>('.seg button')];
const routesBtn = $<HTMLButtonElement>('routes-btn');

const state: {
  window: Window;
  origin: { lat: number; lon: number } | null;
  pending: { lat: number; lon: number } | null;
  requestId: number;
  info: Partial<Record<Window, TimetableInfo>>;
  routes: boolean;
} = { window: 'day', origin: null, pending: null, requestId: 0, info: {}, routes: true };
type Result = Extract<FromWorker, { type: 'result' }>;
let lastResult: Result | null = null;

// The heatmap is painted into this canvas and shown through a MapLibre canvas source.
const heatCanvas = document.createElement('canvas');
heatCanvas.width = heatCanvas.height = 1;

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
    const t = document.createElement('span');
    const i = BAND_EDGES_MIN.indexOf(m);
    t.style.left = `${(100 * i) / BAND_COLORS.length}%`;
    t.textContent = m === 120 ? '120+ min' : String(m);
    return t;
  }),
);

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
    statusEl.textContent = `Computed in ${(m.totalMs / 1000).toFixed(1)} s · tap the map for minutes`;
    prefetchOtherWindow();
  } else if (m.type === 'error') {
    loadbar.hidden = true;
    statusEl.textContent = `Something went wrong: ${m.message}`;
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
  if (!i) {
    feedInfo.textContent = 'Loading timetable…';
  } else {
    feedInfo.textContent = `Timetable from VBB, service day ${i.serviceDate} (feed ${i.feedVersion}, ${i.stops.toLocaleString('en')} stops).`;
  }
}

function compute() {
  if (!state.origin) return;
  state.requestId++;
  loadbar.hidden = false;
  loadbar.classList.add('indeterminate');
  statusEl.textContent = 'Computing…';
  send({ type: 'compute', id: state.requestId, window: state.window, ...state.origin });
}

// ---------- URL state (?from=lat,lon&w=night) ----------
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('routes') === '0') state.routes = false;
  const [lat, lon] = (p.get('from') ?? '').split(',').map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) state.origin = { lat, lon };
  if (p.get('w') === 'night') state.window = 'night';
}
function writeUrl() {
  const p = new URLSearchParams();
  if (state.origin) p.set('from', `${state.origin.lat.toFixed(5)},${state.origin.lon.toFixed(5)}`);
  if (state.window === 'night') p.set('w', 'night');
  if (!state.routes) p.set('routes', '0');
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}
readUrl();

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

function showOrigin() {
  if (!state.origin) return;
  marker.setLngLat([state.origin.lon, state.origin.lat]).addTo(map);
  hint.hidden = true;
}

function setOrigin(lat: number, lon: number) {
  state.origin = { lat, lon };
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
  if (lastResult) showResult(lastResult);
});

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
    const firstLine = ROUTE_LAYERS[0];
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
      firstLine,
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

function gridSeconds(r: Result, lat: number, lon: number): number {
  const [w, s, e, n] = r.bbox;
  const { cols, rows, seconds } = r.grid;
  const c = Math.floor(((lon - w) / (e - w)) * cols);
  const row = Math.floor(((n - lat) / (n - s)) * rows);
  if (c < 0 || c >= cols || row < 0 || row >= rows) return Infinity;
  return seconds[row * cols + c];
}

// A tap that only closes the search panel should not also set a point.
let ignoreClick = false;
map.on('click', (e: MapMouseEvent) => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  const { lat, lng } = e.lngLat;
  if (!state.origin) {
    setOrigin(lat, lng);
    return;
  }
  const secs = lastResult ? gridSeconds(lastResult, lat, lng) : Infinity;
  const label = state.window === 'day' ? 'by day' : 'at night';
  let html =
    secs === Infinity
      ? 'Not reachable within the time window'
      : `<b>${Math.round(secs / 60)} min</b> ${label}`;
  if (state.routes) {
    const { x, y } = e.point;
    const hit = map.queryRenderedFeatures(
      [
        [x - 8, y - 8],
        [x + 8, y + 8],
      ],
      { layers: ['routes-line'] },
    );
    const top = hit.sort((a, b) => b.properties.share - a.properties.share)[0];
    if (top) {
      const pct = Math.round(100 * (top.properties.share as number));
      html = `<b>${escapeHtml(String(top.properties.names))}</b> · fastest way to ${pct}% of the map`;
    }
  }
  readoutText.innerHTML = html;
  state.pending = { lat, lon: lng };
  readout.hidden = false;
});

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

$('readout-start').addEventListener('click', () => {
  if (state.pending) setOrigin(state.pending.lat, state.pending.lon);
});

// ---------- controls ----------
function setWindow(w: Window) {
  state.window = w;
  for (const b of segButtons) b.setAttribute('aria-checked', String(b.dataset.window === w));
  readout.hidden = true;
  renderFeedInfo();
  writeUrl();
  if (state.origin) compute();
  else send({ type: 'load', window: w });
}
for (const b of segButtons)
  b.addEventListener('click', () => setWindow(b.dataset.window as Window));
setWindow(state.window);
showOrigin();

function setRoutes(on: boolean) {
  state.routes = on;
  routesBtn.setAttribute('aria-pressed', String(on));
  if (mapReady) {
    for (const id of ROUTE_LAYERS) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
  writeUrl();
}
routesBtn.addEventListener('click', () => setRoutes(!state.routes));
routesBtn.setAttribute('aria-pressed', String(state.routes));

$('info-btn').addEventListener('click', () => infoDialog.showModal());
infoDialog.addEventListener('click', (e) => {
  if (e.target === infoDialog) infoDialog.close();
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
    showMsg(cached.length ? '' : 'No matches in Berlin');
    return;
  }
  searchAbort?.abort();
  const ctrl = (searchAbort = new AbortController());
  const c = map.getCenter();
  try {
    const list = await searchPlaces(q, { lat: c.lat, lon: c.lng }, ctrl.signal);
    searchCache.set(key, list);
    if (ctrl.signal.aborted) return;
    renderPlaces(list);
    showMsg(list.length ? '' : 'No matches in Berlin');
  } catch {
    if (ctrl.signal.aborted) return;
    renderPlaces([]);
    showMsg(navigator.onLine ? 'Search is not reachable right now' : 'Search needs a connection');
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

function pickPlace(p: Place) {
  closeSearch();
  searchInput.value = p.label;
  setOrigin(p.lat, p.lon);
  map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
}

searchBtn.addEventListener('click', () => (searchPanel.hidden ? openSearch() : closeSearch()));
$('search-close').addEventListener('click', closeSearch);
for (const ev of ['mousedown', 'touchstart'] as const) {
  map.on(ev, () => {
    ignoreClick = !searchPanel.hidden;
    if (ignoreClick) closeSearch();
  });
}

// ---------- PWA ----------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
