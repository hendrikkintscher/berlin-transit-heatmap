// The app: the map and its colours, the start markers, the worker's results, search,
// favourite places and hints. The time sheet (when-sheet.ts), the menu (menu.ts), taps and
// the card at the bottom (tap.ts, trip-card.ts) and the link (url.ts) live in their own
// modules, wired up at the end of this file.
import maplibregl, { type CanvasSource, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import { listen, send } from './boot';
import {
  BAND_COLORS,
  BAND_EDGES_MIN,
  DIFF_COLORS,
  DIFF_EDGES_MIN,
  HOME_COLORS,
  HOME_TICKS,
  bandLabel,
} from './colors';
import { formatDate, gridSeconds, shortStop, stopName, escapeHtml, whenText } from './format';
import { reversePlace, searchPlaces, SEARCH_BBOX, type Place } from './search';
import {
  loadFavourites,
  newId,
  parseImport,
  saveFavourites,
  score,
  WEIGHTS,
  type Weight,
} from './favourites';
import { formatDecimal, formatNumber, initialLang, lang, readStoredLang, setLang, t } from './i18n';
import {
  addMapLayers,
  cornerCoordinates,
  DESERT_LAYER,
  DESERT_SOURCE,
  FREQ_COLORS,
  HEAT_LAYER,
  HEAT_SOURCE,
  heatOpacity,
  LABELS_SOURCE,
  OUTLINE_LAYERS,
  OUTLINES_SOURCE,
  outlineLabel,
  ROUTE_LAYERS,
  ROUTES_SOURCE,
  STATIONS_LAYER,
  STATIONS_SOURCE,
} from './map-layers';
import { initMenu } from './menu';
import { $, createState, NOW_WHEN, remember, seen, type Result, type Special } from './state';
import { initTap } from './tap';
import { linkQuery, MAX_STARTS, readLink, type Point } from './url';
import { computeWindow, desertThresholds, leaveOffset, windowName } from './when';
import { initWhenSheet } from './when-sheet';
import type { FromWorker, ToWorker } from './protocol';

const BERLIN: [number, number] = [13.405, 52.515];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const loadbar = $('loadbar');
const hint = $('hint');
const statusEl = $('status');
const feedInfo = $('feed-info');
const layerLegend = $('layer-legend');
const meetChip = $('meet');
const favChip = $<HTMLButtonElement>('fav-score');
const favList = $<HTMLUListElement>('fav-list');
const locateBtn = $<HTMLButtonElement>('locate-btn');
const tip = $('tip');
const tipText = $('tip-text');
const tipAction = $<HTMLButtonElement>('tip-action');
const installBtn = $<HTMLButtonElement>('install-btn');

// ---------- state, from the link (see url.ts) ----------
const state = createState();
const link = readLink(location.search, { ...state, to: null });
Object.assign(state, link, { window: windowName(link.when) });
// A meeting-point link on Typisch goes back to "Nächste" without the other starts.
if (state.others.length && state.measure === 'typical') state.measureBefore = 'next';
const urlLang = new URLSearchParams(location.search).get('lang');
setLang(initialLang(location.search, readStoredLang()), false);
/** Layer windows already asked of the worker. */
const layersRequested = new Set<string>();

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
// The home map: the last quick connection home, latest (all night) on the left.
$('home-bar').append(
  ...HOME_COLORS.map((c) => {
    const s = document.createElement('span');
    s.style.background = c;
    return s;
  }),
);
$('home-ticks').append(
  ...HOME_TICKS.map((label, i) => {
    const tick = document.createElement('span');
    tick.style.left = `${(100 * (i + 1)) / HOME_COLORS.length}%`;
    tick.textContent = label;
    return tick;
  }),
);

/**
 * The travel-time legend (with `extra`: meeting point minutes "+0 … +120"), the comparison
 * legend, or the home map's clock times.
 */
function showLegend(kind: 'time' | 'diff' | 'home', extra = false) {
  for (const id of ['legend-bar', 'legend-ticks']) $(id).hidden = kind !== 'time';
  for (const id of ['diff-bar', 'diff-ticks']) $(id).hidden = kind !== 'diff';
  for (const id of ['home-bar', 'home-ticks']) $(id).hidden = kind !== 'home';
  $('legend-bar').parentElement!.setAttribute(
    'aria-label',
    t(
      kind === 'diff'
        ? 'legendDiff'
        : kind === 'home'
          ? 'legendHome'
          : extra
            ? 'legendExtra'
            : 'legend',
    ),
  );
  for (const tick of legendTicks) {
    const m = Number(tick.dataset.m);
    if (m === 120) {
      tick.dataset.t = extra ? 'legendMaxExtra' : 'legendMax';
      tick.textContent = t(tick.dataset.t as 'legendMax');
    } else tick.textContent = extra ? `+${m}` : String(m);
  }
}

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
// Started by boot.ts before this module loaded, so the timetable is already on its way.
listen((ev: MessageEvent<FromWorker>) => {
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
  } else if (m.type === 'mapProgress') {
    if (m.id !== state.requestId) return;
    loadbar.classList.remove('indeterminate');
    (loadbar.firstElementChild as HTMLElement).style.width = `${(100 * m.done) / m.total}%`;
    special.progress(m.done, m.total);
  } else if (m.type === 'livingAt') {
    tap.onLiving(m);
  } else if (m.type === 'walk') {
    // Footpaths arrived: redo what was computed with straight-line walks.
    redoWalks();
  } else if (m.type === 'result') {
    if (m.id !== state.requestId) return;
    if (m.living || m.home) special.done(m);
    state.result = m;
    showResult(m);
    tap.onResult();
    loadbar.hidden = true;
    const s = m.totalMs / 1000;
    setStatus(() => t('computed', { s: formatDecimal(s, 1) }), true);
    showTips();
  } else if (m.type === 'trip') {
    tap.onTrip(m);
  } else if (m.type === 'layers') {
    state.layers[m.window] = m;
    if (m.window === state.window) showLayers();
  } else if (m.type === 'error') {
    loadbar.hidden = true;
    setStatus(() => t('failed', { message: m.message }));
  }
});

function renderFeedInfo() {
  const i = state.info[state.window] ?? state.info[computedWindow()];
  feedInfo.textContent = i
    ? t('feedInfo', { date: i.serviceDate, version: i.feedVersion, stops: formatNumber(i.stops) })
    : t('feedLoading');
  $('data-note').textContent = i ? t('dataNote', { date: formatDate(i.serviceDate) }) : '';
}

/** Recomputes the map and the walk-based layers, e.g. after a walking-speed change. */
function redoWalks() {
  special.forget();
  state.layers = {};
  layersRequested.clear();
  showLayers();
  if (state.origin || state.special) tap.keepSpot();
  compute();
}

/** The timetable file the map is computed from (arriving uses the hour before). */
const computedWindow = () => computeWindow(state.when, state.direction);

function compute() {
  if (state.special) return special.compute();
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
    leaveOffset: leaveOffset(state.when),
    walkKmh: state.walkKmh,
    ...(state.stepFree ? { stepFree: true } : {}),
    ...(state.travel !== 'walk' ? { travel: state.travel } : {}),
    ...(state.compare ? { compare: computeWindow(state.compare, state.direction) } : {}),
    ...state.origin,
    ...(state.others.length ? { others: state.others } : {}),
  });
}

function writeUrl() {
  const q = linkQuery(
    { ...state, to: tap.spot() },
    NOW_WHEN,
    // Keep an explicit ?lang= so a shared English link stays English.
    urlLang && urlLang === lang() ? urlLang : null,
  );
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

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

// Start markers: the first, and up to four more for a meeting point, each in its colour.
// Dragging one moves that start; tapping it offers to remove it (a drag is not a tap).
const startMarkers: maplibregl.Marker[] = [];
let draggedAt = 0;
function startMarker(i: number): maplibregl.Marker {
  const have = startMarkers[i];
  if (have) return have;
  const el = document.createElement('div');
  el.className = `origin-marker p${i + 1}`;
  const m = new maplibregl.Marker({ element: el, draggable: true });
  m.on('dragstart', () => (draggedAt = Date.now()));
  m.on('dragend', () => {
    draggedAt = Date.now();
    const { lat, lng } = m.getLngLat();
    moveStart(i, { lat, lon: lng });
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Date.now() - draggedAt < 400) return;
    tap.showStartCard(i);
  });
  return (startMarkers[i] = m);
}

/** All starts: the first, then the meeting point's others. */
const starts = (): Point[] => (state.origin ? [state.origin, ...state.others] : []);

function showOrigin() {
  const list = starts();
  startMarkers.forEach((m, i) => i >= list.length && m.remove());
  list.forEach((p, i) => startMarker(i).setLngLat([p.lon, p.lat]).addTo(map));
  meetChip.hidden = list.length < 2;
  hint.hidden = list.length > 0 || !!state.special || !$('search').hidden;
}

/** The starts changed: markers, the tapped place, the link and the map follow. */
function startsChanged() {
  // Setting a start leaves the where-to-live map for the start's own map.
  if (state.special) {
    state.special = null;
    special.render();
  }
  showOrigin();
  if (state.origin) tap.keepSpot();
  else tap.hideReadout();
  writeUrl();
  if (state.origin) compute();
  else clearResult();
}

function setOrigin(p: Point) {
  state.origin = p;
  startsChanged();
}

/** Moves start i (0 = the first) to p. */
function moveStart(i: number, p: Point) {
  if (i === 0) state.origin = p;
  else state.others[i - 1] = p;
  startsChanged();
}

/** Removes start i; without the first, the next one becomes the start. */
function removeStart(i: number) {
  const list = starts();
  list.splice(i, 1);
  setStarts(list);
}

function setStarts(list: Point[]) {
  state.origin = list[0] ?? null;
  state.others = list.slice(1);
  // Back to the choice before the meeting point, unless one was made since.
  if (!state.others.length && state.measureBefore) {
    state.measure = state.measureBefore;
    state.measureBefore = null;
    whenSheet.renderWhen();
  }
  startsChanged();
}

/** No start: drop the colours, lines and outlines. */
function clearResult() {
  state.requestId++;
  state.result = null;
  renderMeet(undefined);
  loadbar.hidden = true;
  setStatus(() => '');
  renderFavourites();
  showLegend('time');
  if (!state.mapReady) return;
  if (map.getLayer(HEAT_LAYER)) map.setLayoutProperty(HEAT_LAYER, 'visibility', 'none');
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  for (const id of [ROUTES_SOURCE, LABELS_SOURCE, OUTLINES_SOURCE])
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(empty);
}

/** Meeting point: one more start, up to MAX_STARTS. */
function addStart(p: Point) {
  if (!state.origin || starts().length >= MAX_STARTS) return;
  // A meeting point compares on Typisch; the choice before comes back without it.
  if (!state.others.length && state.measure !== 'typical') {
    state.measureBefore = state.measure;
    state.measure = 'typical';
    whenSheet.renderWhen();
  }
  state.others = [...state.others, p];
  startsChanged();
}
// The banner's ✕ ends the meeting point: only the first start stays.
$('meet-close').addEventListener('click', () => setStarts(starts().slice(0, 1)));

map.on('load', () => {
  state.mapReady = true;
  // Start with the attribution collapsed to its (i) button so it does not cover the legend.
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  addMapLayers(map, { routes: state.routes, iso: state.iso, desertCanvas });
  if (state.result) showResult(state.result);
  showLayers();
});

/** Shows or hides the stop-frequency and desert layers, asking the worker for data once. */
function showLayers() {
  layerLegend.hidden = !(state.freq || state.desert);
  renderLayerLegend();
  if (!state.mapReady) return;
  const data = state.layers[state.window];
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

// ---------- suggested meeting points ----------
let meetMarkers: maplibregl.Marker[] = [];
/** Pins for the suggested meeting points; a tap shows everyone's trip there. */
function renderMeet(list: Result['meet']) {
  for (const m of meetMarkers) m.remove();
  meetMarkers = (list ?? []).map((s, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'meet-marker';
    el.innerHTML = `<i>${i + 1}</i><span>${escapeHtml(shortStop(s.name))}</span>`;
    el.title = t('meetSuggestion', { name: stopName(s.name), list: s.mins.join(' · ') });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      tap.tapAt(s.lat, s.lon, undefined, stopName(s.name));
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

function showResult(r: Result) {
  renderMeet(r.meet);
  renderFavourites();
  showLegend(r.compare ? 'diff' : r.home ? 'home' : 'time', r.extraBase !== undefined);
  if (!state.mapReady) return;
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
          'raster-opacity': heatOpacity(state.opacity),
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
    map.setLayoutProperty(
      'outlines-label',
      'text-field',
      outlineLabel(r.home ? 'home' : r.extraBase !== undefined ? 'extra' : 'time'),
    );
  map.triggerRepaint();
}

// A tap that only closes the search panel should not also set a point.
let ignoreClick = false;
map.on('click', (e: MapMouseEvent) => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  tap.tapAt(e.lngLat.lat, e.lngLat.lng, e.point);
});

// The map's (i) attribution sits just above the bottom panel, which changes height.
const bottomPanel = document.querySelector<HTMLElement>('.bottom')!;
new ResizeObserver(() =>
  document.documentElement.style.setProperty('--bottom-h', `${bottomPanel.offsetHeight}px`),
).observe(bottomPanel);

// "Nächste" follows the clock: coming back to the app recomputes from the new "now".
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || state.measure !== 'next') return;
  whenSheet.renderWhen();
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
      setOrigin({ lat, lon });
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
    },
    (err) => {
      locateBtn.classList.remove('busy');
      setStatus(() => t(err.code === err.PERMISSION_DENIED ? 'locateDenied' : 'locateFailed'));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
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
  hint.hidden = true;
  searchInput.focus();
  searchInput.select();
}
function closeSearch() {
  searchPanel.hidden = true;
  hint.hidden = !!state.origin || !!state.special;
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
    menu.open();
    return;
  }
  searchInput.value = p.label;
  map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
  // With a start set, the place may be a new start, a destination or another start:
  // show the trip there, with buttons for the other two.
  if (state.origin && state.result) tap.tapAt(p.lat, p.lon, undefined, p.label, true);
  else setOrigin(p);
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
  favouritesChanged();
}

function favouriteTimes() {
  const r = state.result;
  return r && state.origin && !r.living && !r.home
    ? score(favourites, (lat, lon) => gridSeconds(r, lat, lon))
    : null;
}

/** The list changed: save it, redraw it, and redo the where-to-live map if it is shown. */
function favouritesChanged() {
  saveFavourites(favourites);
  renderFavourites();
  if (state.special?.kind === 'living') compute();
}

// ---------- maps shown instead of the start's ----------
// "Where can I live?" shades the map by the weighted average to the favourite places,
// arriving in the chosen hour (one pass per place). "Bis wann komme ich heim?" shows, for
// home (a start or a favourite), until when a quick connection runs through the evening
// and night (passes every 15 minutes, one hourly file after the other). Both take a few
// seconds, so they run only on request, with progress; the last one is kept until its
// places or the settings change.
/** The evening and night hours the home map reads, in order. */
const HOME_HOURS = [20, 21, 22, 23, 0, 1];

const special = (() => {
  const chip = $('special');
  let last: { key: string; result: Result } | null = null;
  let pending = '';

  function render() {
    const s = state.special;
    chip.hidden = !s;
    document.body.classList.toggle('special', !!s);
    // The "tap the map or search a start" hint would sit on the banner.
    hint.hidden = !!s || !!state.origin || !$('search').hidden;
    if (!s) return;
    $('special-text').textContent =
      s.kind === 'living'
        ? t('living', { count: favourites.length, when: whenText(state.when, 'arrive') })
        : t('home', {
            name: s.name,
            night: t(state.when.day === 'weekday' ? 'homeWeekday' : 'homeWeekend'),
          });
  }

  /** What the worker is asked for (without the id), or null when there is nothing to show. */
  function request():
    | Omit<Extract<ToWorker, { type: 'living' }>, 'id'>
    | Omit<Extract<ToWorker, { type: 'home' }>, 'id'>
    | null {
    const s = state.special;
    const how = {
      walkKmh: state.walkKmh,
      ...(state.stepFree ? { stepFree: true } : {}),
      ...(state.travel !== 'walk' ? { travel: state.travel } : {}),
    };
    if (s?.kind === 'living')
      return favourites.length
        ? {
            type: 'living',
            window: computeWindow(state.when, 'arrive'),
            places: favourites.map((f) => ({ lat: f.lat, lon: f.lon, weight: f.weight })),
            ...how,
          }
        : null;
    if (s?.kind === 'home')
      return {
        type: 'home',
        windows: HOME_HOURS.map((hour) => windowName({ day: state.when.day, hour })),
        lat: s.at.lat,
        lon: s.at.lon,
        ...how,
      };
    return null;
  }

  function progress(done: number, total: number) {
    const i = Math.min(done + 1, total);
    const key = state.special?.kind === 'home' ? 'homeProgress' : 'livingProgress';
    setStatus(() => t(key, { i, n: total }));
  }

  function run() {
    const req = request();
    if (!req) return show(null);
    const key = JSON.stringify(req);
    render();
    state.requestId++;
    if (last?.key === key) {
      state.result = last.result;
      showResult(last.result);
      tap.onResult();
      loadbar.hidden = true;
      return;
    }
    pending = key;
    loadbar.hidden = false;
    loadbar.classList.remove('indeterminate');
    (loadbar.firstElementChild as HTMLElement).style.width = '0%';
    progress(0, req.type === 'home' ? req.windows.length : req.places.length);
    send({ ...req, id: state.requestId });
  }

  /** Shows a special map (computing it) or none (back to the start's map, if any). */
  function show(s: Special | null) {
    if (JSON.stringify(s) === JSON.stringify(state.special)) return;
    state.special = s;
    render();
    if (s) {
      tap.hideReadout();
      run();
    } else if (state.origin) {
      tap.keepSpot();
      compute();
    } else {
      tap.hideReadout();
      clearResult();
    }
  }

  $('special-close').addEventListener('click', () => show(null));
  $('fav-living').addEventListener('click', () => {
    menu.close();
    show({ kind: 'living' });
  });
  return {
    compute: run,
    show,
    render,
    progress,
    done: (result: Result) => (last = { key: pending, result }),
    /** The footpaths arrived: the next map is better than the kept one. */
    forget: () => (last = null),
  };
})();

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
        favouritesChanged();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'fav-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', t('favRemove', { name: f.label }));
      del.addEventListener('click', () => {
        favourites = favourites.filter((x) => x !== f);
        favouritesChanged();
      });
      const home = document.createElement('button');
      home.type = 'button';
      home.className = 'fav-home';
      home.textContent = '🌙';
      home.setAttribute('aria-label', t('homeFav', { name: f.label }));
      home.title = t('homeFav', { name: f.label });
      home.addEventListener('click', () => {
        menu.close();
        special.show({ kind: 'home', at: { lat: f.lat, lon: f.lon }, name: f.label });
      });
      li.append(name, min, weight, home, del);
      return li;
    }),
  );
  $('fav-empty').hidden = favourites.length > 0;
  $('fav-living').hidden = $('fav-living-help').hidden = favourites.length === 0;
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
  menu.open();
  $('fav-title').scrollIntoView({ block: 'start' });
});
$('fav-add').addEventListener('click', () => {
  menu.close();
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

// ---------- the parts in their own modules ----------
const tap = initTap(
  {
    map,
    state,
    send,
    setOrigin,
    addStart,
    removeStart,
    addFavourite: async (at) => {
      let label = `${at.lat.toFixed(4)}, ${at.lon.toFixed(4)}`;
      try {
        label = (await reversePlace(at, lang())) ?? label;
      } catch {
        // Offline or Photon down: keep the coordinates as the name.
      }
      addFavourites([{ label, ...at }]);
    },
    writeUrl,
    onCard: () => {
      if (tipKey === 'tap') hideTip();
    },
    favouriteLabels: () => favourites.map((f) => f.label),
    showHome: (i) => {
      const at = starts()[i];
      if (at)
        special.show({
          kind: 'home',
          at,
          name: i ? t('secondPoint', { n: i + 1 }) : t('startPoint'),
        });
    },
  },
  link.to,
);

const whenSheet = initWhenSheet({
  state,
  closeSearch,
  changed: () => {
    if (state.origin || state.special) tap.keepSpot();
    else tap.hideReadout();
    renderFeedInfo();
    writeUrl();
    showLayers();
    if (state.origin || state.special) compute();
    else send({ type: 'load', window: computedWindow() });
  },
});

const menu = initMenu({
  state,
  writeUrl,
  closeSearch,
  travelChanged: () => {
    whenSheet.renderWhen();
    tap.keepSpot();
    writeUrl();
    compute();
  },
  walkChanged: redoWalks,
  layerChanged: () => {
    showLayers();
    tap.redrawSpot();
  },
  setLayerVisible: (layers, on) => {
    if (!state.mapReady) return;
    for (const id of layers === 'routes' ? ROUTE_LAYERS : OUTLINE_LAYERS)
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  },
  opacityChanged: () => {
    if (map.getLayer(HEAT_LAYER))
      map.setPaintProperty(HEAT_LAYER, 'raster-opacity', heatOpacity(state.opacity));
  },
  langChanged: () => {
    renderFeedInfo();
    renderLayerLegend();
    renderFavourites();
    whenSheet.renderWhen();
    renderTip();
    special.render();
    statusEl.textContent = state.status();
    tap.redrawSpot();
    searchCache.clear();
  },
  setStatus,
  install: () => void install(),
});

whenSheet.setWhen(state.when);
showOrigin();
menu.applyLang(lang(), false);

// ---------- PWA ----------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
