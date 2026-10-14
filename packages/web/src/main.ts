// The app: the map and its colours, the start markers and the worker's results, framing
// and hints. The search bar (search-bar.ts), favourite places (fav-places.ts), the
// where-to-live and home maps (special-maps.ts), the time sheet (when-sheet.ts), the menu
// (menu.ts), taps and the card at the bottom (tap.ts, trip-card.ts) and the link (url.ts)
// live in their own modules, wired up in this file.
import maplibregl, { type CanvasSource, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import { listen, send } from './boot';
import {
  BAND_COLORS,
  BAND_EDGES_MIN,
  DIFF_COLORS,
  DIFF_EDGES_MIN,
  HOME_COLORS,
  HOME_TICKS,
  LIMIT_VEIL,
  bandLabel,
} from './colors';
import { formatDate, shortStop, escapeHtml } from './format';
import { stopName } from './stop-name';
import { initSearch } from './search-bar';
import { initFavouritePlaces } from './fav-places';
import { initSpecialMaps } from './special-maps';
import { formatNumber, initialLang, lang, readStoredLang, setLang, t } from './i18n';
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
  styleOutlines,
  ROUTE_LAYERS,
  ROUTES_SOURCE,
  STATIONS_LAYER,
  STATIONS_SOURCE,
  VEIL_LAYER,
  VEIL_SOURCE,
  veilAround,
  veilOpacity,
} from './map-layers';
import { initChanges } from './changes';
import { initBanners } from './banners';
import { initChips } from './chips';
import { initMenu } from './menu';
import {
  $,
  computeRequest,
  inArea,
  linkState,
  NOW_WHEN,
  remember,
  seen,
  type Result,
} from './state';
import { initTap } from './tap';
import { addTripArrows } from './trip-arrows';
import { cleanName, linkQuery, MAX_STARTS, type Point } from './url';
import {
  computeWindow,
  desertThresholds,
  isDate,
  isoDay,
  catchUp,
  fullHour,
  type Direction,
} from './when';
import { initWhenSheet } from './when-sheet';
import { initBack, replaceUrl } from './back';
import type { FromWorker } from './protocol';
import { dataBase, region } from './region';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const loadbar = $('loadbar');
const hint = $('hint');
const statusEl = $('status');
const feedInfo = $('feed-info');
const layerLegend = $('layer-legend');
const meetChip = $('meet');
const locateBtn = $<HTMLButtonElement>('locate-btn');
const tip = $('tip');
const tipText = $('tip-text');
const tipAction = $<HTMLButtonElement>('tip-action');
const installBtn = $<HTMLButtonElement>('install-btn');
const secondBtn = $<HTMLButtonElement>('second-btn');
secondBtn.addEventListener('click', () => search.open('another'));

// ---------- state, from the link (see url.ts) ----------
const { state, link, outside: linkOutside } = linkState(location.search);
/** Draws the trip's direction arrows, once the map is up. */
let showArrows: ((lines: GeoJSON.FeatureCollection | null) => void) | null = null;
const urlLang = new URLSearchParams(location.search).get('lang');
setLang(initialLang(location.search, readStoredLang()), false);
/** The "what's different today" notice, once the map exists. */
let changes: ReturnType<typeof initChanges> | null = null;
/** Layer windows already asked of the worker. */
const layersRequested = new Set<string>();

// The heatmap is painted into this canvas and shown through a MapLibre canvas source.
const heatCanvas = document.createElement('canvas');
heatCanvas.width = heatCanvas.height = 1;
const desertCanvas = document.createElement('canvas');
desertCanvas.width = desertCanvas.height = 1;

// ---------- legend ----------
// A slim bar on the right edge, 0 at the top; every band gets the same height, so the finer
// 20–50 min bands get the most room.
const legendBands = BAND_COLORS.map((c, b) => {
  const s = document.createElement('span');
  s.style.background = c;
  s.title = `${bandLabel(b)} ${t('min')}`;
  return s;
});
$('legend-bar').append(...legendBands);
const legendTicks = [0, 10, 20, 30, 40, 50, 60, 120].map((m) => {
  const tick = document.createElement('span');
  const i = BAND_EDGES_MIN.indexOf(m);
  tick.style.top = `${(100 * i) / BAND_COLORS.length}%`;
  tick.textContent = String(m);
  tick.dataset.m = String(m);
  if (m === 120) tick.dataset.t = 'legendMax';
  if (m === 0) tick.dataset.t = 'legendMin';
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
    tick.style.top = `${(100 * DIFF_EDGES_MIN.indexOf(m)) / DIFF_COLORS.length}%`;
    tick.textContent = m > 0 ? `+${m}` : `−${-m}`;
    return tick;
  }),
  Object.assign(document.createElement('span'), { textContent: 'min' }),
);
// The home map: the last quick connection home, latest (all night) at the top.
$('home-bar').append(
  ...HOME_COLORS.map((c) => {
    const s = document.createElement('span');
    s.style.background = c;
    return s;
  }),
);
// Its ends say what they mean: the top band runs all night, the bottom one ends before 23 Uhr.
function homeEnd(key: 'legendAllNight' | 'legendBefore23') {
  const tick = document.createElement('span');
  tick.dataset.t = key;
  tick.textContent = t(key);
  return tick;
}
$('home-ticks').append(
  homeEnd('legendAllNight'),
  ...HOME_TICKS.map((label, i) => {
    const tick = document.createElement('span');
    tick.style.top = `${(100 * (i + 1)) / HOME_COLORS.length}%`;
    tick.textContent = label;
    return tick;
  }),
  homeEnd('legendBefore23'),
);

/**
 * The travel-time legend (with `extra`: meeting point minutes "+0 … +120"), the comparison
 * legend, or the home map's clock times.
 */
function showLegend(kind: 'time' | 'diff' | 'home', extra = false, avg = false) {
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
    } else if (m === 0 && !extra) {
      // The where-to-live map shows averages: its key says so.
      tick.dataset.t = avg ? 'legendMinAvg' : 'legendMin';
      tick.textContent = t(tick.dataset.t as 'legendMin');
    } else {
      delete tick.dataset.t;
      tick.textContent = extra ? `+${m}` : String(m);
    }
  }
}

let statusTimer = 0;
/** How long the status line fades out (style.css .status). */
const STATUS_FADE_MS = 600;
/**
 * Sets the status line; `fade` hides it again after a few seconds and then clears it, so
 * it leaves the layout and screen readers do not find it again.
 */
function setStatus(render: () => string, fade = false) {
  state.status = render;
  statusEl.textContent = render();
  statusEl.classList.remove('faded');
  clearTimeout(statusTimer);
  if (fade)
    statusTimer = window.setTimeout(() => {
      statusEl.classList.add('faded');
      statusTimer = window.setTimeout(() => {
        state.status = () => '';
        statusEl.textContent = '';
        statusEl.classList.remove('faded');
      }, STATUS_FADE_MS);
    }, 5000);
}

// ---------- worker ----------
/**
 * The footpath network (walk.bin, the biggest download) is fetched only once the base map
 * is up (and the first map on screen, when there is a start), so it never slows either
 * down. While it streams, the bar and a note say so.
 */
let walkAsked = false;
/**
 * The base map has drawn its first tiles (or BASEMAP_WAIT_MS passed since the first map):
 * the background downloads (footpaths, lines, the next hour) may start.
 */
let basemapUp = false;
let basemapTimer = 0;
const BASEMAP_WAIT_MS = 4000;
/** Starts the background downloads once both the first map and the base map are up. */
function afterFirstMap() {
  if (!basemapUp) {
    basemapTimer ||= window.setTimeout(() => {
      basemapUp = true;
      afterFirstMap();
    }, BASEMAP_WAIT_MS);
    return;
  }
  if (!state.result) return;
  askWalk();
  preloadNextHour();
}
let walkLoading = false;
function askWalk() {
  if (walkAsked) return;
  walkAsked = true;
  send({ type: 'loadWalk' });
}

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
  } else if (m.type === 'walkProgress') {
    walkLoading = true;
    // The bar shows the footpaths' download, unless a map is being computed.
    if (!loadbar.hidden && loadbar.classList.contains('indeterminate')) return;
    loadbar.hidden = false;
    loadbar.classList.toggle('indeterminate', !m.total);
    (loadbar.firstElementChild as HTMLElement).style.width = m.total
      ? `${Math.min(100, (100 * m.loaded) / m.total)}%`
      : '';
    if (!state.status()) setStatus(() => t('walkLoading'));
  } else if (m.type === 'walk' || m.type === 'walkFailed') {
    walkLoading = false;
    if (!loadbar.classList.contains('indeterminate')) loadbar.hidden = true;
    if (state.status() === t('walkLoading')) setStatus(() => '');
    // Footpaths arrived: redo what was computed with straight-line walks.
    if (m.type === 'walk') refineWalks();
  } else if (m.type === 'result') {
    if (m.id !== state.requestId) return;
    refining = false;
    if (m.living || m.home) special.done(m);
    state.result = m;
    showResult(m);
    // A switch changed while it was computing.
    syncImage();
    tap.onResult();
    // The first map is on screen: once the base map is too, the footpaths, while it is
    // being looked at, and the next hour.
    afterFirstMap();
    loadbar.hidden = !walkLoading;
    setStatus(walkLoading ? () => t('walkLoading') : () => '');
    showTips();
  } else if (m.type === 'image') {
    const r = state.result;
    // Only the image the switches still want (they may have changed while it was painted).
    if (!r || r.id !== m.id || (m.limit ?? 0) !== state.limit) return;
    r.image = m.image;
    delete r.unpainted;
    if (m.limit) r.limit = m.limit;
    else delete r.limit;
    drawHeat(r);
    showHeat();
  } else if (m.type === 'trip') {
    tap.onTrip(m);
  } else if (m.type === 'routes') {
    const r = state.result;
    if (!r || r.id !== m.id) return;
    r.routes = m.routes;
    r.labels = m.labels;
    (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData(r.routes);
    (map.getSource(LABELS_SOURCE) as GeoJSONSource | undefined)?.setData(r.labels);
  } else if (m.type === 'moreTrips') {
    tap.onMoreTrips(m);
  } else if (m.type === 'placeName') {
    tap.onPlaceName(m);
  } else if (m.type === 'stations') {
    search.setStations(
      m.list.map((s) => ({
        label: s.name,
        detail: s.lines,
        lat: s.lat,
        lon: s.lon,
        kind: 'station' as const,
        weight: s.perHour,
      })),
    );
  } else if (m.type === 'layers') {
    state.layers[m.window] = m;
    if (m.window === state.window) showLayers();
  } else if (m.type === 'error') {
    refining = false;
    loadbar.hidden = true;
    setStatus(() => t('failed', { message: m.message }));
  }
});

function renderFeedInfo() {
  const i = state.info[state.window] ?? state.info[computedWindow()];
  feedInfo.textContent = i
    ? t('feedInfo', { date: i.serviceDate, version: i.feedVersion, stops: formatNumber(i.stops) })
    : t('feedLoading');
  // A date shows its own timetable, or says when its typical day stood in for it.
  const date = isDate(state.when.day) ? isoDay(state.when.day) : null;
  changes?.update();
  $('data-note').textContent = !i
    ? ''
    : t(!date ? 'dataNote' : date === i.serviceDate ? 'dataNoteDate' : 'dataNoteFallback', {
        date: formatDate(i.serviceDate),
      });
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

/**
 * The footpaths arrived: the map is redone with them, but not right after a tap (its trip
 * would wait behind the map) nor while the drawer's list is being searched (the map would
 * cut it short; up to LIST_HOLD_MS), and a place's card keeps its trip until the refined
 * one is in, so nothing jumps when the minutes stay the same.
 */
function refineWalks() {
  const wait = lastCardAt + PRELOAD_DELAY_MS - performance.now();
  if (wait > 0) return void setTimeout(refineWalks, wait);
  if (tap.listLoading()) {
    listHeldAt ||= performance.now();
    if (performance.now() - listHeldAt < LIST_HOLD_MS)
      return void setTimeout(refineWalks, LIST_POLL_MS);
  }
  listHeldAt = 0;
  if (state.special) return redoWalks();
  state.layers = {};
  layersRequested.clear();
  showLayers();
  refining = true;
  compute();
}
/** When the refresh began to wait for the drawer's list (0: not waiting). */
let listHeldAt = 0;
const LIST_HOLD_MS = 4000;
const LIST_POLL_MS = 100;
/** The map is being redone with the footpaths (till its result is in). */
let refining = false;
/** When the last card was drawn (a tap, a search pick). */
let lastCardAt = 0;

/** The timetable file the map is computed from (arriving uses the hour before). */
const computedWindow = () => computeWindow(state.when, state.direction);

/** Wait after a map before preloading the next hour, so taps right after it stay instant. */
const PRELOAD_DELAY_MS = 1500;
let preloadTimer = 0;

/**
 * Loads the hour after the shown one in the background, so stepping to it is instant:
 * fetched, decoded and prepared in the worker while the map is being looked at. Skipped
 * with the data saver on or on a slow (2G) connection.
 */
function preloadNextHour() {
  clearTimeout(preloadTimer);
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;
  if (state.when.hour >= 23) return;
  const next = computeWindow({ ...state.when, hour: state.when.hour + 1 }, state.direction);
  preloadTimer = window.setTimeout(
    () =>
      send({
        type: 'load',
        window: next,
        quiet: true,
        direction: state.direction,
        ...(state.stepFree ? { stepFree: true } : {}),
        ...(state.travel === 'bike' ? { bike: true } : {}),
      }),
    PRELOAD_DELAY_MS,
  );
}

/** The minute (since 1970) the start's map was last computed in. */
let computedMinute = 0;

function compute() {
  clearTimeout(preloadTimer);
  // Arriving, the set place is where trips end: its marker becomes the Ziel (style.css).
  document.body.classList.toggle(
    'arrive',
    state.direction === 'arrive' && !state.others.length && !state.special,
  );
  if (state.special) return special.compute();
  const origin = state.origin;
  if (!origin) return;
  state.requestId++;
  computedMinute = Math.floor(Date.now() / 60_000);
  loadbar.hidden = false;
  loadbar.classList.add('indeterminate');
  setStatus(() => '');
  send({ type: 'compute', id: state.requestId, ...computeRequest({ ...state, origin }) });
}

function writeUrl() {
  const q = linkQuery(
    { ...state, to: tap.spot() },
    NOW_WHEN,
    // Keep an explicit ?lang= so a shared English link stays English.
    urlLang && urlLang === lang() ? urlLang : null,
  );
  replaceUrl(q ? `?${q}` : location.pathname);
}

// ---------- map ----------
const map = new maplibregl.Map({
  container: 'map',
  style: STYLE_URL,
  center: state.origin ? [state.origin.lon, state.origin.lat] : region.center,
  zoom: 10.3,
  minZoom: 8,
  maxZoom: 18,
  attributionControl: { compact: true },
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
changes = initChanges({
  map,
  state,
  dataBase: dataBase(),
  loaded: () => tap.addChangeNotes(),
});

// Start markers: the first, and up to four more for a meeting point, each in its colour.
// Dragging one moves that start; tapping it offers to remove it (a drag is not a tap).
const startMarkers: maplibregl.Marker[] = [];
let draggedAt = 0;
function startMarker(i: number): maplibregl.Marker {
  const have = startMarkers[i];
  if (have) return have;
  const el = document.createElement('div');
  el.className = `origin-marker p${i + 1}`;
  el.dataset.start = t('dirThere');
  el.dataset.end = t('dirBack');
  // Above the suggested meeting points and the best-spot pins.
  el.style.zIndex = '6';
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
  list.forEach((p, i) => {
    const m = startMarker(i).setLngLat([p.lon, p.lat]).addTo(map);
    const el = m.getElement();
    const name = list.length > 1 ? (state.names[i] ?? '') : '';
    el.classList.toggle('numbered', list.length > 1);
    // A named start shows its initial, and its name on a long press or hover.
    el.textContent = list.length > 1 ? (name ? [...name][0]!.toUpperCase() : String(i + 1)) : '';
    el.title = name;
  });
  meetChip.hidden = list.length < 2;
  hint.hidden = list.length > 0 || !!state.special || search.isOpen();
  // "2. Start" (one more start by search) while no card is shown; CSS hides it under a card.
  secondBtn.hidden = !list.length || list.length >= MAX_STARTS || !!state.special;
  // With one start it starts a meeting (Treffpunkt); in one it adds a person.
  secondBtn.querySelector('span')!.textContent = t(list.length === 1 ? 'meetUp' : 'addPerson');
  secondBtn.setAttribute(
    'aria-label',
    list.length === 1 ? t('meetUpLabel') : t('secondHere', { n: list.length + 1 }),
  );
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

/** `spot` is the tapped place before the change, for "Rückgängig". */
function setOrigin(p: Point, spot = tap.spot()) {
  offerUndo(spot);
  state.origin = p;
  startsChanged();
}

/**
 * The map's place moves to the tapped place and keeps that place's role: a Ziel stays the
 * Ziel, so the direction turns round and the trip stays as it is (only the map changes).
 * `text` names it for "Rückgängig".
 */
function moveAnchor(p: Point, spot: Point | null, text: string) {
  offerUndo(spot, text);
  whenSheet.setDirection(state.direction === 'arrive' ? 'depart' : 'arrive', true);
  state.origin = p;
  startsChanged();
}

/** Moves start i (0 = the first) to p. */
function moveStart(i: number, p: Point) {
  offerUndo(tap.spot());
  if (i === 0) state.origin = p;
  else state.others[i - 1] = p;
  startsChanged();
}

/** How long "Rückgängig" stays after a start moved. */
const UNDO_MS = 5000;
const undoEl = $('undo');
let undoTo: { starts: Point[]; spot: Point | null; direction: Direction } | null = null;
let undoTimer = 0;
/** A start is about to move: for a few seconds, one tap brings the starts and place back. */
function offerUndo(spot: Point | null, text?: string) {
  if (!state.origin) return;
  undoTo = { starts: starts(), spot, direction: state.direction };
  $('undo-text').textContent = text ?? t(state.direction === 'arrive' ? 'undoGoal' : 'undoStart');
  undoEl.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = window.setTimeout(hideUndo, UNDO_MS);
}
function hideUndo() {
  clearTimeout(undoTimer);
  undoEl.hidden = true;
  undoTo = null;
}
$('undo-btn').addEventListener('click', () => {
  const to = undoTo;
  hideUndo();
  if (!to) return;
  tap.placeSpot(to.spot);
  if (to.direction !== state.direction) whenSheet.setDirection(to.direction, true);
  setStarts(to.starts);
});

/** Removes start i; without the first, the next one becomes the start. */
function removeStart(i: number) {
  const list = starts();
  list.splice(i, 1);
  state.names = state.names.filter((_, k) => k !== i);
  setStarts(list);
}

/** Names start i (D2); empty clears it. The marker, cards and link follow. */
function nameStart(i: number, name: string) {
  const names = [...state.names];
  names[i] = cleanName(name);
  state.names = Array.from(names, (n) => n ?? '');
  showOrigin();
  writeUrl();
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
  favPlaces.render();
  showLegend('time');
  // Back to the switch's own look (a where-to-live or home map had the colours on).
  showHeat();
  if (!state.mapReady) return;
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
    // An exact time is only for Nächste: Typisch is on the full hour.
    state.when = fullHour(state.when);
    whenSheet.renderWhen();
  }
  state.others = [...state.others, p];
  startsChanged();
}
// The banner's ✕ ends the meeting point: only the first start stays.
$('meet-close').addEventListener('click', () => {
  state.names = [];
  setStarts(starts().slice(0, 1));
});

// Start with the attribution collapsed to its (i) button so it does not cover the legend:
// MapLibre opens it when the style's sources arrive; until the map has loaded, it is
// closed again before it is painted (observer callbacks run before the next frame).
const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
if (attrib) {
  new MutationObserver((_, obs) => {
    if (state.mapReady) obs.disconnect();
    // (Only when set: removing a missing class still writes the attribute, and loops.)
    else if (attrib.classList.contains('maplibregl-compact-show'))
      attrib.classList.remove('maplibregl-compact-show');
  }).observe(attrib, { attributes: true, attributeFilter: ['class'] });
}

// The base map is up: the footpaths come now (no start yet) or once the first map is there.
map.once('idle', () => {
  basemapUp = true;
  if (!state.origin && !state.special) askWalk();
  else afterFirstMap();
});
map.on('load', () => {
  state.mapReady = true;
  attrib?.classList.remove('maplibregl-compact-show');
  addMapLayers(map, { routes: state.routes, iso: state.iso, desertCanvas });
  showArrows = addTripArrows(map);
  showHeat();
  if (state.result) showResult(state.result);
  tap.onMapReady();
  showLayers();
});

/** Shows or hides the stop-frequency and desert layers, asking the worker for data once. */
function showLayers() {
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
  if (limitShown()) {
    // The key for "Bis N Min."; a tap opens Ebenen, where it is switched.
    rows.push(
      `<button type="button" class="ll-row ll-limit"><span class="ll-title">${t('limitLegend', { n: state.limit })}</span>` +
        `<span class="ll-box ll-clear"></span><span>${t('limitReached')}</span>` +
        `<span class="ll-box ll-veil"></span><span>${t('limitLonger')}</span></button>`,
    );
  }
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
  layerLegend.hidden = !rows.length;
}
layerLegend.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.ll-limit')) chips.show('layers');
});

/** Whether the map shows "Bis N Min." (only the start's own map does). */
function limitShown() {
  const r = state.result;
  return state.limit > 0 && !r?.compare && !r?.living && !r?.home;
}

// ---------- suggested meeting points ----------
// The where-to-live map: pins on its three best spots, with their average minutes.
let bestMarkers: maplibregl.Marker[] = [];
function renderBest(r: Result) {
  for (const m of bestMarkers) m.remove();
  bestMarkers = (r.best ?? []).map((s, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'meet-marker best-pin';
    // Above the favourites' stars, which often sit on the best spot; the best one on top.
    el.style.zIndex = String(5 - i);
    const label = t('livingBest', { n: Math.round(s.seconds / 60) });
    el.innerHTML = `<i>${i + 1}</i><span>${label}</span>`;
    el.title = label;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      tap.tapAt(s.lat, s.lon);
    });
    return new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
  });
}

/** Each start's minutes, with its name when it has one: "Anna 23 · 31 · Cem 18". */
function namedMinutes(mins: readonly (number | string)[]): string {
  return mins.map((m, i) => (state.names[i] ? `${state.names[i]} ${m}` : String(m))).join(' · ');
}

/**
 * The text a shared meeting-point link comes with: the suggested places and everyone's
 * minutes there (D2); null without suggestions.
 */
function meetShareText(): string | null {
  const meet = state.result?.meet;
  if (!state.others.length || !meet?.length) return null;
  const lines = meet.map(
    (s, i) => `${i + 1}. ${stopName(s.name)}: ${namedMinutes(s.mins)} ${t('min')}`,
  );
  return [t('meetShareIntro'), ...lines].join('\n');
}

let meetMarkers: maplibregl.Marker[] = [];
/** Pins for the suggested meeting points; a tap shows everyone's trip there. */
function renderMeet(list: Result['meet']) {
  for (const m of meetMarkers) m.remove();
  meetMarkers = (list ?? []).map((s, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'meet-marker';
    // A star with the rank, so the suggestions do not read as the numbered starts.
    el.innerHTML = `<i>★${i + 1}</i><span>${escapeHtml(shortStop(s.name))}</span>`;
    el.title = t('meetSuggestion', { name: stopName(s.name), list: namedMinutes(s.mins) });
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
  renderBest(r);
  frameResult(r);
  favPlaces.render();
  showLegend(r.compare ? 'diff' : r.home ? 'home' : 'time', r.extraBase !== undefined, !!r.living);
  if (!state.mapReady) return;
  drawHeat(r);
  (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData(r.routes);
  (map.getSource(LABELS_SOURCE) as GeoJSONSource | undefined)?.setData(r.labels);
  (map.getSource(OUTLINES_SOURCE) as GeoJSONSource | undefined)?.setData(r.outlines);
  showHeat();
  map.triggerRepaint();
}

/** Puts the result's colour image on the map (an empty one while it is unpainted). */
function drawHeat(r: Result) {
  if (!state.mapReady) return;
  const { width, height, rgba } = r.image;
  heatCanvas.width = width;
  heatCanvas.height = height;
  heatCanvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const [w, s, e, n] = r.image.bbox ?? r.bbox;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
  const veil = { type: 'FeatureCollection' as const, features: [veilAround([w, s, e, n])] };
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
    map.addSource(VEIL_SOURCE, { type: 'geojson', data: veil });
    map.addLayer(
      {
        id: VEIL_LAYER,
        type: 'fill',
        source: VEIL_SOURCE,
        layout: { visibility: r.limit ? 'visible' : 'none' },
        paint: { 'fill-color': LIMIT_VEIL, 'fill-opacity': veilOpacity(state.opacity) },
      },
      DESERT_LAYER,
    );
  } else {
    if (r.limit) (map.getSource(VEIL_SOURCE) as GeoJSONSource).setData(veil);
    src.setCoordinates(coordinates);
    // A non-animated canvas source re-reads its canvas only while "playing".
    src.play();
    src.pause();
  }
  map.triggerRepaint();
}

/**
 * Asks for the image the switches want when the map has another one: "Bis N Min." (not
 * when comparing), else the colours with the Heatmap switch on. Painting reuses the grid.
 */
function syncImage() {
  const r = state.result;
  if (!r || r.compare || r.living || r.home) return;
  const want = state.limit || (state.heat ? 0 : -1);
  const have = r.unpainted ? -1 : (r.limit ?? 0);
  if (want >= 0 && want !== have)
    send({ type: 'paint', id: r.id, ...(want ? { limit: want } : {}) });
}

/**
 * The colour fill follows the Heatmap switch, and the outlines change their look with it.
 * A comparison (it has no outlines) and the where-to-live and home maps (their colours are
 * the point) always show it; the switch is left as it was for the start's map.
 */
function showHeat() {
  const r = state.result;
  const own = !r?.compare && !r?.living && !r?.home;
  const limit = own && state.limit > 0;
  const heat = state.heat || limit || !own;
  // Outlines alone carry their minutes, so the colour legend steps aside (not the home
  // map's clock colours); "Bis N Min." has its own key in the layer legend.
  document.body.classList.toggle('no-legend', (!heat && !r?.home) || limit);
  renderLayerLegend();
  if (!state.mapReady) return;
  if (map.getLayer(HEAT_LAYER)) {
    map.setLayoutProperty(HEAT_LAYER, 'visibility', r && heat ? 'visible' : 'none');
    // The veil goes with the "Bis N Min." image, not before it arrives.
    map.setLayoutProperty(VEIL_LAYER, 'visibility', limit && r?.limit ? 'visible' : 'none');
  }
  styleOutlines(
    map,
    r?.home ? 'home' : r?.living ? 'living' : r?.extraBase !== undefined ? 'extra' : 'time',
    heat,
    t('min'),
  );
}

// A tap on the map that only closes the search or a chip panel should not also set a
// point. Decided on each pointerdown, at window capture so it runs before the chip row
// closes its panel on the same pointerdown.
let ignoreClick = false;
window.addEventListener(
  'pointerdown',
  (e) => {
    ignoreClick =
      map.getContainer().contains(e.target as Node) && (search.isOpen() || !!chips.isOpen());
  },
  true,
);
map.on('click', (e: MapMouseEvent) => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  tap.tapAt(e.lngLat.lat, e.lngLat.lng, e.point);
});

// The map's (i) attribution sits just above the bottom panel, which changes height.
const bottomPanel = document.querySelector<HTMLElement>('.bottom')!;

// ---------- framing: what a link, a search pick or the meeting points are about ----------
/**
 * Fits the map to these points between the chips and the bottom panel (or the trip card
 * about to open there), at most to zoom 15. Camera only: nothing is computed again.
 */
function frameView(points: Point[], card = false, animate = true) {
  if (points.length < 2 || !state.mapReady) return;
  const box = new maplibregl.LngLatBounds();
  for (const p of points) box.extend([p.lon, p.lat]);
  const h = map.getContainer().clientHeight;
  // Below the chips and any mode banner; the stop names sit right of their dots.
  const top =
    Math.max(
      ...['chips', 'meet', 'cmp', 'special'].map((id) => {
        const el = $(id);
        return el.hidden ? 0 : el.getBoundingClientRect().bottom;
      }),
    ) + 16;
  const below = Math.max(bottomPanel.offsetHeight, card ? h * 0.34 : 0) + 24;
  // A very short screen keeps at least a third of it for the points.
  const room = h - top - below;
  const bottom = room < h / 3 ? Math.max(24, below - (h / 3 - room)) : below;
  map.fitBounds(box, {
    padding: { top, bottom, left: 40, right: 96 },
    maxZoom: 15,
    ...(animate ? { essential: true } : { duration: 0 }),
  });
}
/** The first map from a link with a destination or several starts is framed once. */
let frameLink = !!state.origin && (state.others.length > 0 || !!link.to);
let hadMeet = false;
function frameResult(r: Result) {
  if (!state.mapReady) return;
  const meet = !!r.meet?.length;
  const firstMeet = meet && !hadMeet;
  hadMeet = meet;
  if (!frameLink && !firstMeet) return;
  const fromLink = frameLink;
  frameLink = false;
  const to = fromLink && link.to ? [link.to] : [];
  frameView([...starts(), ...to, ...(r.meet ?? [])], to.length > 0, !fromLink);
}
new ResizeObserver(() =>
  document.documentElement.style.setProperty('--bottom-h', `${bottomPanel.offsetHeight}px`),
).observe(bottomPanel);

// "Nächste" follows the clock: coming back to the app recomputes from the new "now", when
// the minute has moved on since the map was computed or the app was away over a minute.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    hiddenAt = Date.now();
    return;
  }
  if (state.measure !== 'next') return;
  const now = Date.now();
  if (now - hiddenAt <= 60_000 && Math.floor(now / 60_000) === computedMinute) return;
  // A date's hour that is over by now (back after the hour or after midnight) moves on.
  const w = catchUp(state.when, state.direction);
  if (w) return whenSheet.setWhen(w);
  whenSheet.renderWhen();
  compute();
});

// ---------- my location ----------
// The first-open card's buttons: the locate button's action, and the search.
$('hint-locate').addEventListener('click', () => locateBtn.click());
$('hint-search').addEventListener('click', () => search.open());
locateBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    setStatus(() => t('locateFailed'), true);
    return;
  }
  search.close();
  locateBtn.classList.add('busy');
  setStatus(() => t('locating'));
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locateBtn.classList.remove('busy');
      const { latitude: lat, longitude: lon } = coords;
      if (!inArea({ lat, lon })) {
        setStatus(() => t('locateOutside'), true);
        return;
      }
      setOrigin({ lat, lon });
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12.5), essential: true });
    },
    (err) => {
      locateBtn.classList.remove('busy');
      setStatus(
        () => t(err.code === err.PERMISSION_DENIED ? 'locateDenied' : 'locateFailed'),
        true,
      );
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

const search = initSearch({
  map,
  state,
  starts,
  favourites: () => favPlaces.list(),
  closeChips: () => chips.close(),
  setOrigin: (p) => setOrigin(p),
  addStart,
  addFavourite: (p) => {
    favPlaces.add([p]);
    menu.open();
  },
  frameView,
  tapAt: (...a) => tap.tapAt(...a),
});

// ---------- favourite places ----------
const favPlaces = initFavouritePlaces({
  map,
  state,
  compute: () => compute(),
  openMenu: () => menu.open(),
  closeMenu: () => menu.close(),
  openSearch: () => search.open('favourite'),
  showHome: (f) => special.show({ kind: 'home', at: { lat: f.lat, lon: f.lon }, name: f.label }),
});

// ---------- maps shown instead of the start's (special-maps.ts) ----------
const special = initSpecialMaps({
  state,
  send,
  favourites: favPlaces.list,
  isSearchOpen: () => search.isOpen(),
  setStatus,
  showResult,
  compute: () => compute(),
  clearResult,
  closeMenu: () => menu.close(),
  onResult: () => tap.onResult(),
  keepSpot: () => tap.keepSpot(),
  hideReadout: () => tap.hideReadout(),
});

// ---------- the parts in their own modules ----------
const tap = initTap(
  {
    map,
    state,
    send,
    setOrigin,
    moveAnchor,
    addStart,
    removeStart,
    nameStart,
    isFavourite: favPlaces.isAt,
    toggleFavourite: favPlaces.toggle,
    writeUrl,
    onCard: () => {
      lastCardAt = performance.now();
      if (tipKey === 'tap') hideTip();
    },
    favouriteLabels: () => favPlaces.list().map((f) => f.label),
    changeNote: (ride) => changes?.noteFor(ride) ?? null,
    focusChanges: (rides) => changes?.focus(rides),
    openChanges: (ride) => changes?.openFor(ride),
    showArrows: (lines) => showArrows?.(lines),
    refining: () => refining,
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

const chips = initChips({ state, closeSearch: search.close });
initBanners();

const whenSheet = initWhenSheet({
  state,
  closePanel: () => chips.close(),
  rendered: () => chips.render(),
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
  closeSearch: search.close,
  travelChanged: () => {
    whenSheet.renderWhen();
    tap.keepSpot();
    writeUrl();
    compute();
  },
  walkChanged: () => {
    redoWalks();
    chips.render();
  },
  layerChanged: () => {
    showLayers();
    tap.redrawSpot();
    chips.render();
  },
  setLayerVisible: (layers, on) => {
    chips.render();
    if (!state.mapReady) return;
    for (const id of layers === 'routes' ? ROUTE_LAYERS : OUTLINE_LAYERS)
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  },
  heatChanged: () => {
    // Computed with the switch off: the colours are drawn now, from the same grid.
    syncImage();
    showHeat();
    chips.render();
  },
  limitChanged: (toggled) => {
    syncImage();
    // Other minutes only change the image; switching restyles the outlines and the legend.
    if (!toggled) return;
    showHeat();
    chips.render();
  },
  opacityChanged: () => {
    if (map.getLayer(HEAT_LAYER))
      map.setPaintProperty(HEAT_LAYER, 'raster-opacity', heatOpacity(state.opacity));
    if (map.getLayer(VEIL_LAYER))
      map.setPaintProperty(VEIL_LAYER, 'fill-opacity', veilOpacity(state.opacity));
  },
  langChanged: () => {
    renderFeedInfo();
    showOrigin();
    showHeat();
    favPlaces.render();
    whenSheet.renderWhen();
    renderTip();
    special.render();
    statusEl.textContent = state.status();
    tap.redrawSpot();
    search.clearCache();
  },
  setStatus,
  install: () => void install(),
  shareText: meetShareText,
});

// Back closes the top-most open layer (back.ts).
const dialogs = [...document.querySelectorAll('dialog')];
const pops = [...document.querySelectorAll<HTMLElement>('#pops > *')];
const readout = $('readout');
initBack(
  [
    ...dialogs.map((d) => ({ isOpen: () => d.open, close: () => d.close() })),
    { isOpen: search.isOpen, close: search.close },
    { isOpen: () => !!chips.isOpen(), close: chips.close },
    { isOpen: () => !!changes?.isOpen(), close: () => changes?.close() },
    { isOpen: () => !readout.hidden, close: tap.hideReadout },
  ],
  [
    ...dialogs.map((d) => [d, 'open'] as [Element, string]),
    [search.panel, 'class'],
    ...pops.map((p) => [p, 'hidden'] as [Element, string]),
    [$('changes'), 'hidden'],
    [readout, 'hidden'],
  ],
);

whenSheet.setWhen(state.when);
showOrigin();
menu.applyLang(lang(), false);
// First view: the chip labels are known now (they start hidden, so the page never
// paints the HTML's placeholder time or German labels for an English link).
$('chips').classList.remove('unrendered');
search.panel.classList.remove('unrendered');
hint.hidden = !!state.origin || !!state.special;
showHeat();
if (linkOutside) setStatus(() => t('linkOutside'), true);

// ---------- PWA ----------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
