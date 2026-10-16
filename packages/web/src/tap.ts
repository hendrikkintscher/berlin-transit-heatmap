// Tapping the map: the card at the bottom with the minutes to the tapped place, the line
// most journeys there use, the access time and the trip (drawn on the map too). The place
// stays through settings changes until the ✕ or a new tap; a start marker's card offers
// to remove it.

import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { escapeHtml, eveningClock, gridSeconds, whenText } from './format';
import { lang, t } from './i18n';
import {
  ROUTES_CASING_OPACITY,
  ROUTES_OPACITY,
  STATIONS_LAYER,
  TRIP_SOURCE,
  TRIP_STOPS_SOURCE,
} from './map-layers';
import type { StationProps, ToWorker } from './protocol';
import { reverseAddress, type Place } from './search';
import { $, mapDirection, mapToGoal, type State } from './state';
import { arrivedBy, changeNoteHtml, hhmm, leaveText, tripHtml, type Trip } from './trip-card';
import { MODE_COLORS } from './colors';
import { refitRows, ridesKey } from './more-rows';
import { icon } from './icons';
import { MAX_NAME, MAX_STARTS, type Point, type Span } from './url';
import { liveStatus, liveText, type Board } from './live';
import { dataBase } from './region';
import { clockNow, isDate, rolledWindow, rollsOn } from './when';

/** The tapped place; `title` names it (a meeting-point suggestion or a search result). */
export interface Spot extends Point {
  title: string;
  searched: boolean;
}

export interface TapDeps {
  map: maplibregl.Map;
  state: State;
  send: (m: ToWorker) => void;
  /** `spot`: the tapped place before the change, for "Rückgängig". */
  setOrigin: (p: Point, spot?: Point | null) => void;
  /**
   * The map's place moves to p and keeps p's role (the map turns round, the time stays a
   * departure time, the trip's own); `text` names it for "Rückgängig".
   */
  moveAnchor: (
    p: Point,
    spot: Point | null,
    text: string,
    trip?: { leave: number; arrive: number },
  ) => void;
  /** ⇅: the map's place and the tapped place swap Start and Ziel (the time stays). */
  swapEnds: () => void;
  /** Meeting point: one more start. */
  addStart: (p: Point) => void;
  /** Removes start i (0 = the first). */
  removeStart: (i: number) => void;
  /** Names start i in a meeting point (D2). */
  nameStart: (i: number, name: string) => void;
  /** Whether a favourite place lies at the point. */
  isFavourite: (at: Point) => boolean;
  /** Adds the point as a favourite place, or removes the one there. */
  toggleFavourite: (at: Point) => void;
  /** The link changed (the place is part of it). */
  writeUrl: () => void;
  /** A card opened: the "tap the map" hint has done its job. */
  onCard: () => void;
  /** The favourites' names, in list order, for the where-to-live card. */
  favouriteLabels: () => string[];
  /** "Bis wann komme ich heim?" to start i. */
  showHome: (i: number) => void;
  /** Today's change on a ride's line, for the card ("Heute anders"). */
  changeNote: (ride: { name: string; mode: string }) => string | null;
  /** The shown connection's rides (null: none); a changes box opened from the card keeps to them. */
  focusChanges: (rides: { name: string; mode: string }[] | null) => void;
  /** A change note was tapped: the day's changes on that ride's line. */
  openChanges: (ride: { name: string; mode: string }) => void;
  /** Draws the trip's direction arrows (null: none). */
  showArrows: (lines: GeoJSON.FeatureCollection | null) => void;
  /** The map is being redone with the footpaths: the place's trip comes again after it. */
  refining: () => boolean;
  /** Whether the footpaths are in (walks follow them, not straight lines). */
  footpathsIn: () => boolean;
}

/**
 * Another place's trip slower than this dims the shown trip; SWAP_WAIT_MS after that the
 * new card shows without its trip (it follows when it comes).
 */
const SWAP_DIM_MS = 250;
const SWAP_WAIT_MS = 2500;

/** Seconds a link's trip span is widened by on each side. */
const LINK_SLACK_S = 5;
/**
 * Seconds a trip span kept before the footpaths were in is widened by on each side once they
 * are: the walks at the ends change with them. Over 296 random trips (bench/kept.ts) the card
 * then keeps the same rides in 43 % (with the usual trip where none fits), against 24 % with
 * only the usual trip; 180 s gains 2 points more but lets other trips in (0.13.8d).
 */
const FOOTPATH_SLACK_S = 120;

/** `initial` is the place in the link, `span` its trip's times (url.ts). */
export function initTap(deps: TapDeps, initial: Point | null, initialSpan: Span | null = null) {
  const { map, state, send } = deps;
  const readout = $('readout');
  const readoutText = $('readout-text');
  const secondBtn = $<HTMLButtonElement>('readout-second');
  const dirBtn = $<HTMLButtonElement>('readout-dir');
  const anchorBtn = $<HTMLButtonElement>('readout-anchor');
  dirBtn.innerHTML = icon('swap', 22);
  dirBtn.setAttribute('aria-label', t('dirSwap'));
  dirBtn.title = t('dirSwap');
  anchorBtn.innerHTML = icon('rings', 22);
  /** What the next card highlights: the roles after ⇅, the rings after they moved. */
  let flash: 'roles' | 'rings' | null = null;
  const removeBtn = $<HTMLButtonElement>('readout-remove');
  const homeBtn = $<HTMLButtonElement>('readout-home');

  let spot: Spot | null = initial && { ...initial, title: '', searched: false };
  /** Where the rings button, "2. Start" and "Merken" act: the place, or the address it snapped to. */
  let pending: Point | null = null;
  let tripId = 0;
  /** Under Typisch, the map's average minutes at the tapped place (one start). */
  let shownAvg: number | undefined;
  /** The place the shown trip goes to, and whether a later one was already asked for. */
  let tripAt: { lat: number; lon: number; askedLater: boolean } | null = null;
  let removeWhich = 0;
  /** The shown trip's first vehicle, for its live status (today only), and the last check. */
  let board: Board | null = null;
  let liveAt = 0;
  /**
   * The card for a newly tapped place, held back while the shown trip stays until the new
   * trip arrives (see tapAt).
   */
  let deferred: { id: number; render: () => void; timer: number } | null = null;
  /** The rides of the connection on the card, for its "Heute anders" notes. */
  let shownRides: { name: string; mode: string }[] = [];

  const spotEl = document.createElement('div');
  spotEl.className = 'spot-marker';
  // The ends are labelled Start and Ziel (style.css).
  spotEl.dataset.start = t('dirThere');
  spotEl.dataset.end = t('dirBack');
  const spotMarker = new maplibregl.Marker({ element: spotEl });
  // A place from the link (?to=) shows at once; its card follows with the first map.
  if (spot) spotMarker.setLngLat([spot.lon, spot.lat]).addTo(map);

  /**
   * The card for a spot: minutes, line, access time and the trip there. `at` is the spot on
   * screen, for picking up a station dot or line under the finger.
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
    const data = state.layers[state.window];
    const station = state.freq && data ? near([STATIONS_LAYER])[0] : undefined;
    let html: string;
    /** A trip to the place is on its way (not the where-to-live or home map's lines). */
    let tripAsked = false;
    if (station) {
      setSpot(null);
      const p = station.properties as StationProps;
      html =
        t('stationFreq', { name: escapeHtml(p.name), n: p.perHour }) +
        (p.lines ? `<small>${escapeHtml(p.lines)}</small>` : '');
    } else if (!state.origin && !state.special && !(state.desert && data)) {
      setSpot(null);
      deps.setOrigin({ lat, lon: lng });
      return;
    } else {
      const r = state.result;
      const secs = r && (state.origin || state.special) ? gridSeconds(r, lat, lng) : NaN;
      const parts: string[] = [];
      shownAvg = undefined;
      let tripSlot = '';
      if (secs >= 0 && r?.home) parts.push(homeText(r, lat, lng));
      else if (secs >= 0 && r?.living)
        parts.push(
          secs < Infinity ? t('livingScore', { n: Math.round(secs / 60) }) : t('unreachable'),
        );
      else if (secs >= 0 && r?.compare) {
        const b = gridSeconds(r, lat, lng, r.compare);
        const fmt = (v: number) => (v < Infinity ? String(Math.round(v / 60)) : '–');
        const d = Math.round(b / 60) - Math.round(secs / 60);
        parts.push(
          t('cmpMinutes', {
            a: fmt(secs),
            b: fmt(b),
            d: Number.isFinite(d) ? (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0') : '–',
          }) +
            `<small>${whenText(state.when, state.direction)} → ${whenText(state.compare!, state.direction)}</small>`,
        );
      } else if (secs === Infinity) parts.push(t('unreachable'));
      else if (secs >= 0 && r?.each) {
        // One unbreakable piece per person (Ø with the first, "·" after each but the last, the
        // unit with the last), so a narrow card wraps between people and never leaves "Min."
        // or "·" alone. Under Typisch these are the hour's averages, not the trips below them.
        const avgMark = state.measure === 'typical' ? 'Ø ' : '';
        const last = r.each.length - 1;
        const each = r.each.map((v, i) => {
          const s = gridSeconds(r, lat, lng, v);
          const name = state.names[i] ? `${escapeHtml(state.names[i])} ` : '';
          const unit = i === last ? ` ${t('min')}` : ' ·';
          const mark = i === 0 ? avgMark : '';
          return `<span class="each">${mark}<i class="p${i + 1}"></i>${name}${s < Infinity ? Math.round(s / 60) : '–'}${unit}</span>`;
        });
        parts.push(`<b>${each.join(' ')}</b>`);
        // How much worse than the best spot, left out when it hardly is.
        const extra = r.extraBase !== undefined ? Math.round((secs - r.extraBase) / 60) : 0;
        if (extra > 2) parts.push(`<small>${t('extraMinutes', { n: extra })}</small>`);
      } else if (secs >= 0) {
        // The next connection's own minutes and arrival take this line's place when they come.
        parts.push(`<span id="tap-mins">${t('minutes', { n: Math.round(secs / 60) })}</span>`);
        if (state.measure === 'typical') shownAvg = Math.round(secs / 60);
      }
      // The connection itself (or, on the where-to-live map, the minutes to each favourite)
      // arrives from the worker a moment later.
      if (secs < Infinity && r) {
        tripId++;
        send(
          r.living
            ? { type: 'livingAt', id: tripId, map: r.id, lat, lon: lng }
            : r.home
              ? { type: 'homeTrip', id: tripId, map: r.id, lat, lon: lng }
              : { type: 'trip', id: tripId, lat, lon: lng, ...keptSpan(lat, lng) },
        );
        tripAt = r.living || r.home ? null : { lat, lon: lng, askedLater: false };
        tripAsked = tripAt !== null;
        tripSlot = '<span id="trip" class="trip"></span><div id="trip-more" class="more"></div>';
      }
      if (state.desert && data) {
        const access = gridSeconds(data.desert, lat, lng);
        parts.push(
          access === Infinity ? t('accessNone') : t('access', { n: Math.round(access / 60) }),
        );
      }
      html = parts.join('<br>') + tripSlot;
      setSpot({ lat, lon: lng, title, searched });
    }
    if (title) html = `<b class="spot-name">${escapeHtml(title)}</b>${html}`;
    pending = { lat, lon: lng };
    const at0 = pending;
    // Another place while a trip is on the card: the card keeps the shown trip until the
    // new one is in, then both change at once (no empty card in between).
    const swap =
      tripAsked && !readout.hidden && !!document.getElementById('trip')?.firstElementChild;
    clearTimeout(deferred?.timer);
    deferred = null;
    const render = () => {
      deferred = null;
      readout.classList.remove('stale');
      showCard(html, false);
      const count = state.origin ? 1 + state.others.length : 0;
      secondBtn.hidden = !count || count >= MAX_STARTS || !!state.special;
      const second = count === 1 ? t('meetUpLabel') : t('secondHere', { n: count + 1 });
      secondBtn.setAttribute('aria-label', second);
      secondBtn.title = second;
      if (!title && map.getZoom() >= 15) void showAddress(at0);
      // One start and a trip to the place: from the start to it, or from it to the start.
      dirBtn.hidden = !(
        state.origin &&
        !state.others.length &&
        !state.special &&
        !state.compare &&
        html.includes('id="trip"')
      );
      // The rings move to the place (keeping its role) wherever a trip could go.
      anchorBtn.hidden = !(
        state.origin &&
        !state.others.length &&
        !state.special &&
        !state.compare
      );
      if (!anchorBtn.hidden) {
        const label = t(mapToGoal(state) ? 'anchorFrom' : 'anchorTo');
        anchorBtn.setAttribute('aria-label', label);
        anchorBtn.title = label;
        placeAnchor();
      }
      deps.onCard();
    };
    if (!swap) return render();
    const id = tripId;
    deferred = {
      id,
      render,
      // A slow answer dims the shown trip after a moment; a lost one still shows the card.
      timer: window.setTimeout(() => {
        if (deferred?.id !== id) return;
        readout.classList.add('stale');
        deferred.timer = window.setTimeout(() => deferred?.id === id && render(), SWAP_WAIT_MS);
      }, SWAP_DIM_MS),
    };
  }

  /**
   * At street level, names the address under the tap; moving the rings there then starts
   * at the house rather than a few metres off it.
   */
  async function showAddress(at: Point) {
    let place: Place | null = null;
    try {
      place = await reverseAddress(at, lang());
    } catch {
      return; // Offline or Photon down: the card works without it.
    }
    if (!place || pending !== at || readout.hidden) return;
    // Only snap to an address close to the tap (about 60 m).
    const dy = (place.lat - at.lat) * 111_000;
    const dx = (place.lon - at.lon) * 111_000 * Math.cos((at.lat * Math.PI) / 180);
    if (Math.hypot(dx, dy) > 60) return;
    const el = document.createElement('small');
    el.className = 'addr';
    el.textContent = place.label;
    readoutText.prepend(el);
    pending = { lat: place.lat, lon: place.lon };
  }

  /**
   * Home map: until when a way home takes under 1 h, and until when under 1 h 30. Both are
   * "seconds before end" on the grid, so smaller is later.
   */
  function homeText(r: NonNullable<State['result']>, lat: number, lng: number): string {
    const h = r.home!;
    const fast = gridSeconds(r, lat, lng);
    const any = gridSeconds(r, lat, lng, h.any);
    if (!(any < Infinity)) return t('homeNone');
    if (!(fast < Infinity)) return t('homeSlowOnly', { time: eveningClock(h.end - any) });
    // Leaving at 2 Uhr or later still gets home by 4: all night.
    const allNight = (v: number) => v <= 2 * 3600;
    if (allNight(fast)) return t('homeAllNight');
    const night = allNight(any)
      ? t('homeNightAll')
      : any < fast - 300
        ? t('homeNightUntil', { time: eveningClock(h.end - any) })
        : t('homeNoNight');
    return `${t('homeFast', { time: eveningClock(h.end - fast) })}<small>${night}</small>`;
  }

  /** The card at the bottom: minutes for a spot, or a start point with a remove button. */
  function showCard(html: string, start: boolean) {
    readoutText.innerHTML = html;
    dirBtn.hidden = anchorBtn.hidden = true;
    for (const id of ['readout-second', 'readout-fav']) $(id).hidden = start;
    // The detailed connection and the drawer, once a trip with stops has come.
    readout.classList.remove('can-open');
    showFav();
    removeBtn.hidden = homeBtn.hidden = !start;
    readout.hidden = false;
  }

  function showStartCard(i: number) {
    hideReadout();
    removeWhich = i;
    const mark = state.others.length ? `<i class="p${i + 1}"></i>` : '';
    const goal = mapToGoal(state) && !state.others.length;
    const title = i ? t('secondPoint', { n: i + 1 }) : t(goal ? 'goalPoint' : 'startPoint');
    // In a meeting point each start can carry a name (D2): the marker shows its initial.
    const field = state.others.length
      ? `<input class="start-name" maxlength="${MAX_NAME}" enterkeyhint="done" aria-label="${escapeHtml(t('startNameLabel'))}" placeholder="${escapeHtml(t('startNamePlaceholder'))}" value="${escapeHtml(state.names[i] ?? '')}">`
      : '';
    showCard(`${mark}<b>${title}</b>${field}`, true);
    const input = readoutText.querySelector<HTMLInputElement>('.start-name');
    input?.addEventListener('change', () => deps.nameStart(i, input.value));
    input?.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    deps.onCard();
    // Its name (the nearest stop) follows from the worker.
    const p = i ? state.others[i - 1] : state.origin;
    if (!p) return;
    nameId++;
    send({ type: 'placeName', id: nameId, lat: p.lat, lon: p.lon });
  }

  let nameId = 0;
  /** The start card's place name arrived: "Startpunkt · bei S Südkreuz". */
  function onPlaceName(m: { id: number; name: string | null }) {
    if (m.id !== nameId || !m.name || readout.hidden || removeBtn.hidden) return;
    const b = readoutText.querySelector('b');
    if (!b || readoutText.querySelector('.place-name')) return;
    const s = document.createElement('small');
    s.className = 'place-name';
    s.textContent = t('pointNear', { name: m.name });
    b.after(s);
  }

  function hideReadout() {
    clearDeferred();
    connections = [];
    moreState = 'idle';
    readout.hidden = true;
    tripId++;
    setTrip(null);
    setSpot(null);
    shownRides = [];
    deps.focusChanges(null);
  }

  function clearDeferred() {
    clearTimeout(deferred?.timer);
    deferred = null;
    readout.classList.remove('stale');
  }

  function setSpot(p: Spot | null) {
    readout.classList.remove('stale');
    const same = p === spot || (p && spot && p.lat === spot.lat && p.lon === spot.lon);
    spot = p;
    if (p) spotMarker.setLngLat([p.lon, p.lat]).addTo(map);
    else spotMarker.remove();
    if (!same) deps.writeUrl();
  }

  /**
   * A setting changed and a new map is on its way: the tapped place stays, dimmed until the
   * new map recomputes its card and trip. Any other card (a start, a station) closes.
   */
  function keepSpot() {
    if (!spot) return hideReadout();
    clearDeferred();
    listStale = true;
    tripId++;
    setTrip(null);
    readout.classList.add('stale');
  }

  /** Redraws the place's card now, for a change that needs no new map (language, layers). */
  function redrawSpot() {
    if (!spot || (!state.origin && !state.special && !state.desert)) return hideReadout();
    // Without a map yet, the coming one redraws it.
    if (state.result || (!state.origin && !state.special))
      tapAt(spot.lat, spot.lon, undefined, spot.title, spot.searched);
  }

  /** A new map is in: the place's card and trip follow it. */
  function onResult() {
    if (spot) tapAt(spot.lat, spot.lon, undefined, spot.title, spot.searched);
  }

  /** The journey on the map, kept for a map that was not ready when it came. */
  let drawn: Pick<Trip, 'lines' | 'stops'> | null = null;
  /** Draws a journey (or clears it); while one is shown the Lines layer steps back. */
  function setTrip(trip: Pick<Trip, 'lines' | 'stops'> | null) {
    drawn = trip;
    if (!state.mapReady) return;
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    (map.getSource(TRIP_SOURCE) as GeoJSONSource | undefined)?.setData(trip?.lines ?? empty);
    (map.getSource(TRIP_STOPS_SOURCE) as GeoJSONSource | undefined)?.setData(trip?.stops ?? empty);
    deps.showArrows(trip?.lines ?? null);
    map.setPaintProperty('routes-line', 'line-opacity', trip ? 0.5 : ROUTES_OPACITY);
    map.setPaintProperty('routes-casing', 'line-opacity', trip ? 0.35 : ROUTES_CASING_OPACITY);
    map.setLayoutProperty('routes-label', 'visibility', state.routes && !trip ? 'visible' : 'none');
  }

  // While the card is open, "los in X Min." counts down; once the connection is missed,
  // the next one is asked for.
  setInterval(() => {
    // Not in a background tab: no live checks nobody sees (the next tick catches up).
    if (document.hidden || readout.hidden || !tripAt) return;
    const now = clockNow(state.when);
    if (now === null) return;
    if (Date.now() - liveAt > 60_000) checkLive();
    for (const el of readout.querySelectorAll<HTMLElement>('.trip-leave[data-leave]')) {
      const leave = Number(el.dataset.leave);
      el.textContent = leaveText(leave, now);
      // Arriving, the connection is the last one by the time: no later one to ask for.
      if (leave >= now - 30 || tripAt.askedLater || state.direction === 'arrive') continue;
      // The next one comes from the loaded file, past the full hour too; once the file
      // no longer covers it, the card only says the connection is gone.
      if (!rollsOn(state.when, now)) {
        el.textContent = t('tripMissed');
        continue;
      }
      tripAt.askedLater = true;
      tripId++;
      const window = rolledWindow(state.when, now);
      send({
        type: 'trip',
        id: tripId,
        lat: tripAt.lat,
        lon: tripAt.lon,
        leaveAt: now,
        ...(window ? { window } : {}),
      });
    }
  }, 15_000);

  /** The journey to the tapped spot arrived from the worker. */
  function onTrip(m: Trip) {
    if (m.id !== tripId || readout.hidden) return;
    if (deferred?.id === m.id) {
      clearTimeout(deferred.timer);
      deferred.render();
    }
    if (!document.getElementById('trip')) return;
    // The same vehicles again (the map was redone with the footpaths, the place tapped
    // again): the drawer keeps its list, fitted to the new walks, and the picked row; a
    // whole list quietly looks for the other lines again (their walks may be other ones),
    // a list cut short by the refresh is asked for again.
    const key = ridesKey(m);
    if (key && !listStale && key === ridesKey(connections[0])) {
      connections = [m, ...refitRows(connections.slice(1), m)];
      showTrip(connections[shownConnection] ?? m);
      if (moreState === 'done' && moreComplete) {
        renderMore();
        return askMore(true);
      }
      // The rows shown so far stay while the rest comes again.
      moreAsked = false;
      askMore();
      if (moreAsked) return;
      moreState = 'idle';
      return renderMore();
    }
    listStale = false;
    showTrip(m);
    // The drawer's list starts again from this connection.
    connections = [m];
    shownConnection = 0;
    moreAsked = false;
    moreState = 'idle';
    renderMore();
    askMore();
  }

  /** Puts a connection on the card and the map. */
  function showTrip(m: Trip) {
    const el = document.getElementById('trip');
    if (!el) return;
    // On the home map the trip runs from the place to home.
    const home = state.special?.kind === 'home' ? state.special.at : null;
    // A meeting point's other trips stay unfolded when the card refreshes.
    const open = el.querySelector<HTMLDetailsElement>('.trip-more')?.open;
    el.innerHTML = tripHtml(m, {
      direction: home ? 'arrive' : mapDirection(state),
      now: clockNow(state.when),
      place: spot?.title || undefined,
      changeNote: deps.changeNote,
      avg: shownAvg,
      names: state.names,
      rows: home || state.others.length ? undefined : { anchorTitle: t('anchorIs') },
    });
    if (open) el.querySelector<HTMLDetailsElement>('.trip-more')!.open = true;
    // Right after ⇅ or the rings moved, the rows show what changed (style.css).
    if (flash) {
      el.querySelector('.trip-rows')?.classList.add(`flash-${flash}`);
      flash = null;
    }
    readout.classList.toggle('can-open', !!el.querySelector('.trip-head.opens'));
    markExpanded();
    shownRides = m.journeys.flatMap((j) =>
      (j?.legs ?? []).flatMap((l) => (l.type === 'ride' ? [{ name: l.name, mode: l.mode }] : [])),
    );
    deps.focusChanges(shownRides);
    // With one start, the connection's own minutes and arrival become the card's main line.
    if (m.journeys.length === 1 && m.journeys[0]?.leave !== undefined)
      document.getElementById('tap-mins')?.remove();
    placeAnchor();
    if (tripAt) tripAt.askedLater = false;
    setTrip(m);
    board = (m.journeys.length === 1 && m.journeys[0]?.board) || null;
    checkLive();
  }

  // The drawer (pulling the card up): the shown connection and the ones after it
  // (arriving: before it), asked for once the pull starts, so they come up with the card.
  let connections: Trip[] = [];
  let shownConnection = 0;
  let moreAsked = false;
  let moreId = 0;
  /** The drawer's list: "loading" until the worker answers, then the connections. */
  let moreState: 'idle' | 'loading' | 'done' = 'idle';
  /** Whether the worker's searches for the list went through (not cut short). */
  let moreComplete = false;
  /** A setting changed: the list was for the old one, even if the connection is the same. */
  let listStale = false;
  /**
   * Asks the worker for the drawer's list, once the drawer opens. `quiet`: the whole list
   * is on screen and stays there until the one for the new walks is through.
   */
  function askMore(quiet = false) {
    const j = connections[0]?.journeys;
    const one = j?.length === 1 ? j[0] : null;
    if (
      (moreAsked && !quiet) ||
      (!quiet && !readout.matches('.drawer, .pull-list')) ||
      !tripAt ||
      !one ||
      one.leave === undefined ||
      one.arrive === undefined ||
      state.special
    )
      return;
    if (!quiet && deps.refining()) {
      // The map is being redone with the footpaths: the worker is busy with it, and the
      // place's trip comes again right after, so the list is asked for then (onTrip), not
      // now only to be cut short.
      moreState = 'loading';
      return renderMore();
    }
    moreAsked = true;
    moreId++;
    send({
      type: 'moreTrips',
      id: moreId,
      lat: tripAt.lat,
      lon: tripAt.lon,
      leave: one.leave,
      arrive: one.arrive,
      ...(quiet ? { quiet } : {}),
    });
    if (quiet) return;
    moreState = 'loading';
    moreComplete = false;
    renderMore();
  }

  function onMoreTrips(m: { id: number; trips: Omit<Trip, 'type' | 'id'>[]; done: boolean }) {
    if (m.id !== moreId || !connections.length) return;
    moreComplete = m.done;
    // The list may come again, longer (other lines found later): the picked row stays picked.
    const picked = connections[shownConnection];
    connections = [
      connections[0]!,
      ...m.trips.map((x) => ({ ...x, type: 'trip' as const, id: connections[0]!.id })),
    ];
    const k = connections.findIndex((c) => ridesKey(c) === ridesKey(picked));
    if (k >= 0) shownConnection = k;
    else if (shownConnection && picked) {
      // Beaten by a row found later, it stays in the list while it is on the card.
      // In the list's order: departing by leaving, arriving by arriving, backwards.
      const when = (c: Trip) =>
        state.direction === 'arrive' ? -(c.journeys[0]?.arrive ?? 0) : (c.journeys[0]?.leave ?? 0);
      const at = connections.findIndex((c, i) => i > 0 && when(c) > when(picked));
      shownConnection = at < 0 ? connections.length : at;
      connections.splice(shownConnection, 0, picked);
    }
    moreState = 'done';
    renderMore();
    showList();
  }

  /** The list of connections in the open drawer, the shown one marked. */
  function renderMore() {
    const box = document.getElementById('trip-more');
    if (!box) return;
    if (moreState === 'idle' || !connections.length) {
      box.innerHTML = '';
      return;
    }
    const arrive = state.direction === 'arrive';
    const rows = connections.map((c, k) => {
      const j = c.journeys[0];
      if (!j || j.leave === undefined || j.arrive === undefined) return '';
      const badges = j.legs
        .filter((l) => l.type === 'ride')
        .map(
          (l) =>
            `<span class="line-badge" style="background:${MODE_COLORS[l.mode] ?? '#444'}">${escapeHtml(l.name)}</span>`,
        )
        .join('');
      const mins = Math.max(1, Math.round((j.arrive - j.leave) / 60));
      return `<button type="button" class="more-row${k === shownConnection ? ' on' : ''}" data-k="${k}" aria-pressed="${k === shownConnection}"><time>${hhmm(j.leave)} → ${hhmm(arrivedBy(j.arrive))}</time><span>${mins} ${t('min')}</span><span class="more-badges">${badges}</span></button>`;
    });
    // Arriving, the earlier ones go above the shown one, in time order.
    const ordered = arrive ? rows.slice(1).reverse().concat(rows[0]!) : rows;
    const note =
      moreState === 'loading'
        ? `<small>${t('moreLoading')}</small>`
        : connections.length === 1
          ? `<small>${t('moreNone')}</small>`
          : '';
    box.innerHTML = `<b class="more-title">${t(arrive ? 'moreEarlier' : 'moreLater')}</b>${ordered.join('')}${note}`;
  }

  readoutText.addEventListener('click', (e) => {
    const row = (e.target as Element).closest<HTMLButtonElement>('.more-row');
    if (!row) return;
    const k = Number(row.dataset.k);
    const c = connections[k];
    if (!c || k === shownConnection) return;
    shownConnection = k;
    showTrip(c);
    renderMore();
  });

  /** The rings button sits in the other place's row of the trip; without rows, in the side column. */
  function placeAnchor() {
    if (anchorBtn.hidden) return;
    const slot = readoutText.querySelector('.anchor-slot');
    if (slot) slot.replaceChildren(anchorBtn);
    else if (anchorBtn.parentElement !== dirBtn.parentElement) dirBtn.after(anchorBtn);
  }

  /** The notes for the shown connection, when the changes arrived after its card. */
  function addChangeNotes() {
    const el = document.getElementById('trip');
    if (!el || !shownRides.length || el.querySelector('.trip-change')) return;
    const seen = new Set<string>();
    for (const r of shownRides) {
      const n = deps.changeNote(r);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      el.insertAdjacentHTML('beforeend', changeNoteHtml(n, r));
    }
  }

  /** Asks for the first vehicle's live status and shows it under the countdown. */
  function checkLive() {
    const day = state.when.day;
    const b = board;
    if (!b || !isDate(day) || clockNow(state.when) === null) return;
    liveAt = Date.now();
    const id = tripId;
    void liveStatus(b, day, dataBase()).then((s) => {
      const el = document.querySelector<HTMLElement>('#trip .trip-live');
      if (!s || !el || id !== tripId || b !== board) return;
      const { text, bad } = liveText(b.line, s);
      el.textContent = text;
      el.classList.toggle('bad', bad);
      el.hidden = false;
    });
  }

  /** Where-to-live map: the minutes from the tapped place to each favourite. */
  function onLiving(m: { id: number; minutes: (number | null)[] }) {
    if (m.id !== tripId || readout.hidden) return;
    const el = document.getElementById('trip');
    if (!el) return;
    const labels = deps.favouriteLabels();
    el.innerHTML = `<small class="trip-stops">${m.minutes
      .map((n, i) => `${escapeHtml(labels[i] ?? '')} ${n ?? '–'} ${t('min')}`)
      .join(' · ')}</small>`;
  }

  /**
   * The trip the card showed when the map moved to its other end, for that place while the
   * map stays as moved: its card asks for that trip again (within its times).
   */
  let kept: {
    lat: number;
    lon: number;
    span: Span;
    map: string;
    /** Found with straight-line walks: widened once the footpaths are in. */
    straight?: true;
    /** Seconds the card's ask widens the span by on each side (the link keeps it as it is). */
    slack?: number;
  } | null = null;
  /** What the map is computed for, as far as the kept trip goes. */
  const mapKey = () =>
    JSON.stringify([
      state.origin,
      state.others,
      state.when,
      state.direction,
      state.toGoal,
      state.measure,
      state.travel,
      state.walkKmh,
      state.stepFree,
    ]);
  // A link carries it (trip=), so it opens on the same trip; a little wider, as the places
  // in a link are rounded to about a metre (the walks at the ends may take a moment longer).
  if (initial && initialSpan)
    kept = {
      ...initial,
      span: { leave: initialSpan.leave - LINK_SLACK_S, arrive: initialSpan.arrive + LINK_SLACK_S },
      map: mapKey(),
    };
  /** The kept trip's span while it is for (lat, lon) and the map as it is. */
  const keptFor = (lat: number, lon: number) =>
    kept && kept.lat === lat && kept.lon === lon && kept.map === mapKey() ? kept.span : null;
  function keptSpan(lat: number, lon: number) {
    const span = keptFor(lat, lon);
    if (!span) kept = null;
    const s = kept?.slack ?? 0;
    return span ? { span: { leave: span.leave - s, arrive: span.arrive + s } } : {};
  }

  // The rings move to the place, which keeps its role (a Ziel stays the Ziel: the direction
  // turns round, the trip stays). The old place of the map becomes the tapped place, so a
  // second tap turns it back.
  anchorBtn.addEventListener('click', () => {
    const at = pending;
    const old = state.origin;
    const before = spot;
    if (!at || !old) return;
    const arrive = mapToGoal(state);
    // The place's name from its row (the nearest stop or its search title), if the trip is in.
    const name = readoutText.querySelector('.trip-row:not(.anchor) .name')?.textContent;
    const text = name
      ? t(arrive ? 'anchorFromNow' : 'anchorToNow', { name })
      : t(arrive ? 'anchorFromHere' : 'anchorToHere');
    // The shown connection's times, so the map at the other end gives the same trip.
    const shown = connections[shownConnection]?.journeys;
    const j = shown?.length === 1 ? shown[0] : null;
    const trip =
      j?.leave !== undefined && j.arrive !== undefined
        ? { leave: j.leave, arrive: j.arrive }
        : undefined;
    flash = 'rings';
    hideReadout();
    setSpot({ lat: old.lat, lon: old.lon, title: '', searched: false });
    deps.moveAnchor(at, before, text, trip);
    kept = trip
      ? {
          lat: old.lat,
          lon: old.lon,
          span: trip,
          map: mapKey(),
          ...(deps.footpathsIn() ? {} : { straight: true as const }),
        }
      : null;
    // The link keeps that trip too.
    if (kept) deps.writeUrl();
  });
  secondBtn.addEventListener('click', () => {
    const at = pending;
    hideReadout();
    if (at) deps.addStart(at);
  });
  // A toggle: the card stays, a second tap removes the place again.
  const favBtn = $<HTMLButtonElement>('readout-fav');
  function showFav() {
    const on = !!pending && deps.isFavourite(pending);
    // A star icon; its words for screen readers and as a tooltip.
    favBtn.innerHTML = icon(on ? 'starFilled' : 'star', 22);
    favBtn.setAttribute('aria-label', t(on ? 'favOn' : 'favHere'));
    favBtn.title = favBtn.getAttribute('aria-label')!;
    favBtn.setAttribute('aria-pressed', String(on));
  }
  favBtn.addEventListener('click', () => {
    if (!pending) return;
    deps.toggleFavourite(pending);
    showFav();
  });
  removeBtn.addEventListener('click', () => deps.removeStart(removeWhich));
  homeBtn.addEventListener('click', () => deps.showHome(removeWhich));
  $('readout-close').addEventListener('click', hideReadout);
  // Start and Ziel swap: the map and the trip turn round, the time stays as it is.
  dirBtn.addEventListener('click', () => {
    flash = 'roles';
    deps.swapEnds();
  });
  // Two steps, each staying for the next cards until closed again: a tap on the trip's
  // summary opens the detailed connection (#readout.expanded); pulling the card up opens
  // the drawer with the connections after it (#readout.drawer), or, where there is no such
  // list (a meeting point, the special maps), the detailed connection.
  function markExpanded() {
    const open = String(readout.classList.contains('expanded'));
    for (const h of readoutText.querySelectorAll('.trip-head.opens'))
      h.setAttribute('aria-expanded', open);
  }
  function setExpanded(open: boolean) {
    readout.classList.toggle('expanded', open);
    markExpanded();
  }
  /** Whether the drawer has a list: one start's connection with its times, a plain map. */
  function hasList() {
    const j = connections[0]?.journeys;
    return !!tripAt && !state.special && j?.length === 1 && j[0]?.leave !== undefined;
  }
  function setDrawer(open: boolean) {
    if (open && !hasList()) return setExpanded(true);
    readout.classList.toggle('drawer', open);
    if (!open) return;
    askMore();
    // Below an open detailed connection, the list scrolls into view.
    listInView = readout.classList.contains('expanded');
    showList();
  }
  let listInView = false;
  function showList() {
    if (!listInView || moreState === 'loading') return;
    listInView = false;
    document.getElementById('trip-more')?.scrollIntoView({ block: 'nearest' });
  }
  // A change note opens the day's changes on its line ("Heute anders"), not the details.
  function noteRide(target: EventTarget | null) {
    const n = (target as Element).closest<HTMLElement>('.trip-change[data-line]');
    return n ? { name: n.dataset.line!, mode: n.dataset.mode ?? '' } : null;
  }
  readoutText.addEventListener('click', (e) => {
    const ride = noteRide(e.target);
    if (ride) {
      if (!justPulled()) deps.openChanges(ride);
      return;
    }
    const head = (e.target as Element).closest('.trip-head.opens');
    if (!head || justPulled()) return;
    setExpanded(!readout.classList.contains('expanded'));
  });
  readoutText.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const ride = noteRide(e.target);
    if (ride) {
      e.preventDefault();
      deps.openChanges(ride);
      return;
    }
    if (!(e.target as Element).matches('.trip-head.opens')) return;
    e.preventDefault();
    setExpanded(!readout.classList.contains('expanded'));
  });
  // The pull: up, the card grows from the bottom with the finger; down, the open card
  // follows it. Released past 30 px, the drawer (or the detailed view) opens or closes.
  let pull: { y: number; id: number; dy: number } | null = null;
  readout.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    if (!readout.classList.contains('can-open')) return;
    if (target.closest('button:not(.grip), summary, a, input')) return;
    // Inside the scrolled card, a drag scrolls it until it is back at the top.
    if (readoutText.scrollTop > 0) return;
    pull = { y: e.clientY, id: e.pointerId, dy: 0 };
  });
  readout.addEventListener('pointermove', (e) => {
    if (!pull || pull.id !== e.pointerId) return;
    const dy = e.clientY - pull.y;
    if (!pull.dy && Math.abs(dy) < 8) return;
    if (!pull.dy) {
      readout.setPointerCapture(e.pointerId);
      readout.classList.add('pulling');
      // Pulled up from the closed card, the list fills in now and slides up with it.
      if (dy < 0 && !readout.matches('.drawer, .expanded') && hasList()) {
        readout.classList.add('pull-list');
        askMore();
      }
    }
    pull.dy = dy || -0.1;
    const open = readout.classList.contains('drawer') || readout.classList.contains('expanded');
    if (dy < 0 && !readout.classList.contains('drawer')) {
      const up = Math.min(-dy, 260);
      // The list shows as far as pulled; past its end, the card grows empty below it.
      const list = readout.classList.contains('pull-list')
        ? Math.min(up, document.getElementById('trip-more')?.scrollHeight ?? 0)
        : 0;
      readout.style.setProperty('--pull-list', `${list}px`);
      readout.style.setProperty('--pull-up', `${up - list}px`);
    } else if (dy > 0 && open) readout.style.transform = `translateY(${dy}px)`;
  });
  function endPull(e: PointerEvent) {
    if (!pull || pull.id !== e.pointerId) return;
    const dy = e.type === 'pointerup' ? e.clientY - pull.y : 0;
    const moved = pull.dy !== 0;
    pull = null;
    readout.classList.remove('pulling', 'pull-list');
    readout.style.removeProperty('--pull-up');
    readout.style.removeProperty('--pull-list');
    readout.style.transform = '';
    if (!moved) return;
    pulledAt = performance.now();
    if (dy < -30) setDrawer(true);
    else if (dy > 30) {
      if (readout.classList.contains('drawer')) setDrawer(false);
      else setExpanded(false);
    }
  }
  readout.addEventListener('pointerup', endPull);
  readout.addEventListener('pointercancel', endPull);
  /** The click right after a pull is the pull's own. */
  let pulledAt = -Infinity;
  const justPulled = () => performance.now() - pulledAt < 400;
  $('readout-grip').addEventListener('click', () => {
    if (justPulled() || !readout.classList.contains('can-open')) return;
    if (hasList()) setDrawer(!readout.classList.contains('drawer'));
    else setExpanded(!readout.classList.contains('expanded'));
  });

  /** Puts the tapped place back (or none) before the starts change ("Rückgängig"). */
  function placeSpot(p: Point | null) {
    hideReadout();
    if (p) setSpot({ lat: p.lat, lon: p.lon, title: '', searched: false });
  }

  return {
    tapAt,
    placeSpot,
    onPlaceName,
    onMoreTrips,
    /** The map's layers are in: a trip that came before them is drawn now. */
    onMapReady: () => drawn && setTrip(drawn),
    showStartCard,
    hideReadout,
    keepSpot,
    redrawSpot,
    onResult,
    onTrip,
    onLiving,
    addChangeNotes,
    /**
     * The footpaths are in: a trip kept with straight-line walks is asked for with a wider
     * span, so the card finds it again around the new walks once the map is redone (0.13.8d).
     */
    onFootpaths() {
      if (kept?.straight) kept = { ...kept, straight: undefined, slack: FOOTPATH_SLACK_S };
    },
    /** The place kept in the link. */
    spot: (): Point | null => spot,
    /** The trip kept for that place in the link, once the map moved to its other end. */
    span: (): Span | null => (spot ? keptFor(spot.lat, spot.lon) : null),
    /** The drawer's list is being searched (the footpaths' refresh waits for it). */
    listLoading: () => moreAsked && !moreComplete,
  };
}
