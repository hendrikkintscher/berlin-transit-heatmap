import maplibregl, { type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { BAND_COLORS, MAX_BAND } from './colors';
import type { FromWorker, TimetableInfo, ToWorker, Window } from './protocol';

const BERLIN: [number, number] = [13.405, 52.515];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const HEAT_SOURCE = 'heat';
const HEAT_LAYER = 'heat-fill';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const loadbar = $('loadbar');
const hint = $('hint');
const readout = $('readout');
const readoutText = $('readout-text');
const statusEl = $('status');
const feedInfo = $('feed-info');
const infoDialog = $<HTMLDialogElement>('info');
const segButtons = [...document.querySelectorAll<HTMLButtonElement>('.seg button')];

const state: {
  window: Window;
  origin: { lat: number; lon: number } | null;
  pending: { lat: number; lon: number } | null;
  requestId: number;
  info: Partial<Record<Window, TimetableInfo>>;
} = { window: 'day', origin: null, pending: null, requestId: 0, info: {} };
let lastResult: GeoJSON.FeatureCollection | null = null;

// ---------- legend ----------
$('legend-bar').append(
  ...BAND_COLORS.map((c) => {
    const s = document.createElement('span');
    s.style.background = c;
    return s;
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
    (loadbar.firstElementChild as HTMLElement).style.width = m.total ? `${Math.min(100, (100 * m.loaded) / m.total)}%` : '';
  } else if (m.type === 'loaded') {
    state.info[m.info.window] = m.info;
    if (m.info.window === state.window) loadbar.hidden = true;
    renderFeedInfo();
  } else if (m.type === 'result') {
    if (m.id !== state.requestId) return;
    lastResult = m.geojson;
    (map.getSource(HEAT_SOURCE) as GeoJSONSource | undefined)?.setData(m.geojson);
    loadbar.hidden = true;
    const demo = state.info[m.window]?.demo ? ' · demo data' : '';
    statusEl.textContent = `Computed in ${(m.totalMs / 1000).toFixed(1)} s${demo} · tap the map for minutes`;
  } else if (m.type === 'error') {
    loadbar.hidden = true;
    statusEl.textContent = `Something went wrong: ${m.message}`;
  }
};

function renderFeedInfo() {
  const i = state.info[state.window];
  if (!i) {
    feedInfo.textContent = 'Loading timetable…';
  } else if (i.demo) {
    feedInfo.textContent = 'No timetable published yet, so the map shows made-up demo times based on distance.';
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
  const [lat, lon] = (p.get('from') ?? '').split(',').map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) state.origin = { lat, lon };
  if (p.get('w') === 'night') state.window = 'night';
}
function writeUrl() {
  const p = new URLSearchParams();
  if (state.origin) p.set('from', `${state.origin.lat.toFixed(5)},${state.origin.lon.toFixed(5)}`);
  if (state.window === 'night') p.set('w', 'night');
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

map.on('load', () => {
  // Start with the attribution collapsed to its (i) button so it does not cover the legend.
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addSource(HEAT_SOURCE, { type: 'geojson', data: lastResult ?? { type: 'FeatureCollection', features: [] } });
  const colorExpr: unknown[] = ['step', ['get', 'band'], BAND_COLORS[0]];
  for (let b = 1; b <= MAX_BAND; b++) colorExpr.push(b, BAND_COLORS[b]);
  map.addLayer(
    {
      id: HEAT_LAYER,
      type: 'fill',
      source: HEAT_SOURCE,
      paint: {
        'fill-color': colorExpr as maplibregl.ExpressionSpecification,
        'fill-opacity': 0.65,
        'fill-antialias': false,
      },
    },
    firstSymbol,
  );
});

map.on('click', (e: MapMouseEvent) => {
  const { lat, lng } = e.lngLat;
  if (!state.origin) {
    setOrigin(lat, lng);
    return;
  }
  const f = map.queryRenderedFeatures(e.point, { layers: [HEAT_LAYER] })[0];
  const secs = f?.properties?.seconds as number | undefined;
  const label = state.window === 'day' ? 'by day' : 'at night';
  readoutText.innerHTML =
    secs === undefined
      ? 'Not reachable within the time window'
      : `<b>${Math.round(secs / 60)} min</b> ${label}`;
  state.pending = { lat, lon: lng };
  readout.hidden = false;
});

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
for (const b of segButtons) b.addEventListener('click', () => setWindow(b.dataset.window as Window));
setWindow(state.window);
showOrigin();

$('info-btn').addEventListener('click', () => infoDialog.showModal());
infoDialog.addEventListener('click', (e) => {
  if (e.target === infoDialog) infoDialog.close();
});

// ---------- PWA ----------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
