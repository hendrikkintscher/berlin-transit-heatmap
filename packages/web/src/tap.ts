// Tapping the map: the card at the bottom with the minutes to the tapped place, the line
// most journeys there use, the access time and the trip (drawn on the map too). The place
// stays through settings changes until the ✕ or a new tap; a start marker's card offers
// to remove it.

import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { escapeHtml, eveningClock, gridSeconds, whenText } from './format';
import { lang, t } from './i18n';
import { STATIONS_LAYER, TRIP_SOURCE, TRIP_STOPS_SOURCE } from './map-layers';
import type { StationProps, ToWorker } from './protocol';
import { reverseAddress, type Place } from './search';
import { $, type State } from './state';
import { hhmm, leaveText, tripHtml, type Trip } from './trip-card';
import { MODE_COLORS } from './colors';
import { MAX_STARTS, type Point } from './url';
import { liveStatus, liveText, type Board } from './live';
import { dataBase } from './region';
import { clockNow, isDate } from './when';

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
  /** Meeting point: one more start. */
  addStart: (p: Point) => void;
  /** Removes start i (0 = the first). */
  removeStart: (i: number) => void;
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
  /** The shown connection's rides (null: none); the changes notice keeps to them. */
  focusChanges: (rides: { name: string; mode: string }[] | null) => void;
}

/**
 * Another place's trip slower than this dims the shown trip; SWAP_WAIT_MS after that the
 * new card shows without its trip (it follows when it comes).
 */
const SWAP_DIM_MS = 250;
const SWAP_WAIT_MS = 2500;

export function initTap(deps: TapDeps, initial: Point | null) {
  const { map, state, send } = deps;
  const readout = $('readout');
  const readoutText = $('readout-text');
  const secondBtn = $<HTMLButtonElement>('readout-second');
  const detailsBtn = $<HTMLButtonElement>('readout-details');
  const dirBtn = $<HTMLButtonElement>('readout-dir');
  const removeBtn = $<HTMLButtonElement>('readout-remove');
  const homeBtn = $<HTMLButtonElement>('readout-home');

  let spot: Spot | null = initial && { ...initial, title: '', searched: false };
  /** Where "Hier starten", "2. Start" and "Merken" act: the place, or the address it snapped to. */
  let pending: Point | null = null;
  let tripId = 0;
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
        const each = r.each.map((v, i) => {
          const s = gridSeconds(r, lat, lng, v);
          return `<i class="p${i + 1}"></i>${s < Infinity ? Math.round(s / 60) : '–'}`;
        });
        parts.push(`<b>${each.join(' · ')} ${t('min')}</b>`);
        if (r.extraBase !== undefined)
          parts.push(
            `<small>${t('extraMinutes', { n: Math.max(0, Math.round((secs - r.extraBase) / 60)) })}</small>`,
          );
      } else if (secs >= 0)
        // The next connection's own minutes and arrival take this line's place when they come.
        parts.push(`<span id="tap-mins">${t('minutes', { n: Math.round(secs / 60) })}</span>`);
      // The connection itself (or, on the where-to-live map, the minutes to each favourite)
      // arrives from the worker a moment later.
      if (secs < Infinity && r) {
        tripId++;
        send(
          r.living
            ? { type: 'livingAt', id: tripId, map: r.id, lat, lon: lng }
            : r.home
              ? { type: 'homeTrip', id: tripId, map: r.id, lat, lon: lng }
              : { type: 'trip', id: tripId, lat, lon: lng },
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
      showCard(html, false, searched);
      const count = state.origin ? 1 + state.others.length : 0;
      secondBtn.hidden = !count || count >= MAX_STARTS || !!state.special;
      const second = t('secondHere', { n: count + 1 });
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
      if (!dirBtn.hidden) {
        placeDir();
        // The set place's role in the trip: Start or Ziel, the current one marked.
        const arrive = state.direction === 'arrive';
        dirBtn.innerHTML = `<b${arrive ? '' : ' class="on"'}>${t('dirThere')}</b> ⇄ <b${arrive ? ' class="on"' : ''}>${t('dirBack')}</b>`;
        dirBtn.setAttribute('aria-label', t('dirSwap'));
        dirBtn.title = t('dirSwap');
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
   * At street level, names the address under the tap; "Hier starten" then starts there, so
   * the start sits on the house rather than a few metres off it.
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
  function showCard(html: string, start: boolean, searched = false) {
    readoutText.innerHTML = html;
    dirBtn.hidden = true;
    // A search result offers "Neuer Start" next to "2. Start". Arriving, the set place is
    // where trips end, so the button makes the place the new destination.
    const arrive = state.direction === 'arrive' && !state.others.length;
    $('readout-start').textContent = t(
      searched ? (arrive ? 'newGoal' : 'newStart') : arrive ? 'goalHere' : 'startHere',
    );
    for (const id of ['readout-start', 'readout-second', 'readout-fav']) $(id).hidden = start;
    // Details (the stops) once a trip with stops has come.
    detailsBtn.hidden = true;
    showFav();
    removeBtn.hidden = homeBtn.hidden = !start;
    readout.hidden = false;
  }

  function showStartCard(i: number) {
    hideReadout();
    removeWhich = i;
    const mark = state.others.length ? `<i class="p${i + 1}"></i>` : '';
    const goal = state.direction === 'arrive' && !state.others.length;
    showCard(
      `${mark}<b>${i ? t('secondPoint', { n: i + 1 }) : t(goal ? 'goalPoint' : 'startPoint')}</b>`,
      true,
    );
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
    map.setPaintProperty('routes-line', 'line-opacity', trip ? 0.5 : 1);
    map.setPaintProperty('routes-casing', 'line-opacity', trip ? 0.35 : 0.9);
    map.setLayoutProperty('routes-label', 'visibility', state.routes && !trip ? 'visible' : 'none');
  }

  // While the card is open, "los in X Min." counts down; once the connection is missed,
  // the next one is asked for.
  setInterval(() => {
    if (readout.hidden || !tripAt) return;
    const now = clockNow(state.when);
    if (now === null) return;
    if (Date.now() - liveAt > 60_000) checkLive();
    for (const el of readout.querySelectorAll<HTMLElement>('.trip-leave[data-leave]')) {
      const leave = Number(el.dataset.leave);
      el.textContent = leaveText(leave, now);
      // Arriving, the connection is the last one by the time: no later one to ask for.
      if (leave >= now - 30 || tripAt.askedLater || state.direction === 'arrive') continue;
      // The timetable file covers departures within the chosen hour: past it, the card
      // only says the connection is gone (choosing the new hour shows the next ones).
      if (now >= (state.when.hour + 1) * 3600) {
        el.textContent = t('tripMissed');
        continue;
      }
      tripAt.askedLater = true;
      tripId++;
      send({ type: 'trip', id: tripId, lat: tripAt.lat, lon: tripAt.lon, leaveAt: now });
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
      direction: home ? 'arrive' : state.direction,
      now: clockNow(state.when),
      place: spot?.title || undefined,
      changeNote: deps.changeNote,
    });
    if (open) el.querySelector<HTMLDetailsElement>('.trip-more')!.open = true;
    detailsBtn.hidden = !el.querySelector('.stops, .timeline');
    shownRides = m.journeys.flatMap((j) =>
      (j?.legs ?? []).flatMap((l) => (l.type === 'ride' ? [{ name: l.name, mode: l.mode }] : [])),
    );
    deps.focusChanges(shownRides);
    // With one start, the connection's own minutes and arrival become the card's main line.
    if (m.journeys.length === 1 && m.journeys[0]?.leave !== undefined)
      document.getElementById('tap-mins')?.remove();
    placeDir();
    if (tripAt) tripAt.askedLater = false;
    setTrip(m);
    board = (m.journeys.length === 1 && m.journeys[0]?.board) || null;
    checkLive();
  }

  // The drawer (Details, or pulling the card up): the shown connection in detail and the
  // ones after it (arriving: before it), asked for only once the drawer is open.
  let connections: Trip[] = [];
  let shownConnection = 0;
  let moreAsked = false;
  let moreId = 0;
  /** The drawer's list: "loading" until the worker answers, then the connections. */
  let moreState: 'idle' | 'loading' | 'done' = 'idle';

  function askMore() {
    const j = connections[0]?.journeys;
    const one = j?.length === 1 ? j[0] : null;
    if (
      moreAsked ||
      !readout.classList.contains('details') ||
      !tripAt ||
      !one ||
      one.leave === undefined ||
      one.arrive === undefined ||
      state.special
    )
      return;
    moreAsked = true;
    moreState = 'loading';
    moreId++;
    send({
      type: 'moreTrips',
      id: moreId,
      lat: tripAt.lat,
      lon: tripAt.lon,
      leave: one.leave,
      arrive: one.arrive,
    });
    renderMore();
  }

  function onMoreTrips(m: { id: number; trips: Omit<Trip, 'type' | 'id'>[] }) {
    if (m.id !== moreId || !connections.length) return;
    connections = [
      connections[0]!,
      ...m.trips.map((x) => ({ ...x, type: 'trip' as const, id: connections[0]!.id })),
    ];
    moreState = 'done';
    renderMore();
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
      return `<button type="button" class="more-row${k === shownConnection ? ' on' : ''}" data-k="${k}" aria-pressed="${k === shownConnection}"><time>${hhmm(j.leave)} → ${hhmm(j.arrive)}</time><span>${mins} ${t('min')}</span><span class="more-badges">${badges}</span></button>`;
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

  /** The Start ⇄ Ziel switch sits beside the lines under the trip's main line, so that keeps one line. */
  function placeDir() {
    if (dirBtn.hidden) return;
    const main = readoutText.querySelector('.trip-main');
    if (main) main.after(dirBtn);
    else if (dirBtn.parentElement !== readoutText) readoutText.prepend(dirBtn);
  }

  /** The notes for the shown connection, when the changes arrived after its card. */
  function addChangeNotes() {
    const el = document.getElementById('trip');
    if (!el || !shownRides.length || el.querySelector('.trip-change')) return;
    for (const n of new Set(shownRides.map((r) => deps.changeNote(r)).filter(Boolean))) {
      const s = document.createElement('small');
      s.className = 'trip-change';
      s.textContent = n;
      el.append(s);
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

  // The place becomes the start, and the old start the place the trip goes to (with one
  // start), so a second tap on "Hier starten" turns it back.
  $('readout-start').addEventListener('click', () => {
    const at = pending;
    const old = state.origin && !state.others.length && !state.special ? state.origin : null;
    const before = spot;
    hideReadout();
    if (!at) return;
    if (old) setSpot({ lat: old.lat, lon: old.lon, title: '', searched: false });
    deps.setOrigin(at, before);
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
    favBtn.textContent = on ? '★' : '☆';
    favBtn.setAttribute('aria-label', t(on ? 'favOn' : 'favHere').replace(/^[☆★] /, ''));
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
  // The same switch as Losfahren / Ankommen in the time panel: the map and the trip turn round.
  dirBtn.addEventListener('click', () =>
    document
      .querySelector<HTMLButtonElement>(
        `#pop-when [data-dir="${state.direction === 'arrive' ? 'depart' : 'arrive'}"]`,
      )
      ?.click(),
  );
  // Details opens the drawer and it stays open for the next cards, until closed again.
  function setDrawer(open: boolean) {
    readout.classList.toggle('details', open);
    detailsBtn.setAttribute('aria-expanded', String(open));
    if (open) askMore();
  }
  detailsBtn.addEventListener('click', () => setDrawer(!readout.classList.contains('details')));
  // Pulling the card up opens the drawer, pushing it down closes it.
  let pull: { y: number; id: number } | null = null;
  readout.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    if (detailsBtn.hidden || target.closest('button:not(.grip), summary, a, input')) return;
    // Inside the scrolled drawer, a drag scrolls it until it is back at the top.
    if (readoutText.scrollTop > 0) return;
    pull = { y: e.clientY, id: e.pointerId };
  });
  readout.addEventListener('pointerup', (e) => {
    if (!pull || pull.id !== e.pointerId) return;
    const dy = e.clientY - pull.y;
    pull = null;
    const open = readout.classList.contains('details');
    pulled = Math.abs(dy) > 30;
    if (dy < -30 && !open) setDrawer(true);
    else if (dy > 30 && open) setDrawer(false);
  });
  readout.addEventListener('pointercancel', () => (pull = null));
  /** The grip's click right after a pull is the pull's own. */
  let pulled = false;
  $('readout-grip').addEventListener('click', () => {
    if (pulled) return void (pulled = false);
    if (!detailsBtn.hidden) setDrawer(!readout.classList.contains('details'));
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
    /** The place kept in the link. */
    spot: (): Point | null => spot,
  };
}
