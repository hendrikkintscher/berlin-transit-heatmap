// Tapping the map: the card at the bottom with the minutes to the tapped place, the line
// most journeys there use, the access time and the trip (drawn on the map too). The place
// stays through settings changes until the ✕ or a new tap; a start marker's card offers
// to remove it.

import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { escapeHtml, gridSeconds, whenText } from './format';
import { lang, t } from './i18n';
import { STATIONS_LAYER, TRIP_SOURCE, TRIP_STOPS_SOURCE } from './map-layers';
import type { StationProps, ToWorker } from './protocol';
import { reverseAddress, type Place } from './search';
import { $, type State } from './state';
import { tripHtml, type Trip } from './trip-card';
import type { Point } from './url';

/** The tapped place; `title` names it (a meeting-point suggestion or a search result). */
export interface Spot extends Point {
  title: string;
  searched: boolean;
}

export interface TapDeps {
  map: maplibregl.Map;
  state: State;
  send: (m: ToWorker) => void;
  setOrigin: (p: Point) => void;
  setSecond: (p: Point) => void;
  removeStart: (which: 1 | 2) => void;
  addFavourite: (at: Point) => void;
  /** The link changed (the place is part of it). */
  writeUrl: () => void;
  /** A card opened: the "tap the map" hint has done its job. */
  onCard: () => void;
}

export function initTap(deps: TapDeps, initial: Point | null) {
  const { map, state, send } = deps;
  const readout = $('readout');
  const readoutText = $('readout-text');
  const secondBtn = $<HTMLButtonElement>('readout-second');
  const removeBtn = $<HTMLButtonElement>('readout-remove');

  let spot: Spot | null = initial && { ...initial, title: '', searched: false };
  /** Where "Hier starten", "2. Start" and "Merken" act: the place, or the address it snapped to. */
  let pending: Point | null = null;
  let tripId = 0;
  let removeWhich: 1 | 2 = 1;

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
    if (station) {
      setSpot(null);
      const p = station.properties as StationProps;
      html =
        t('stationFreq', { name: escapeHtml(p.name), n: p.perHour }) +
        (p.lines ? `<small>${escapeHtml(p.lines)}</small>` : '');
    } else if (!state.origin && !(state.desert && data)) {
      setSpot(null);
      deps.setOrigin({ lat, lon: lng });
      return;
    } else {
      const r = state.result;
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
          }) +
            `<small>${whenText(state.when, state.direction)} → ${whenText(state.compare!, state.direction)}</small>`,
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
        const top = near(['routes-line']).sort(
          (a, b) => b.properties.share - a.properties.share,
        )[0];
        if (top) {
          const pct = Math.round(100 * (top.properties.share as number));
          parts.push(
            `<small>${t('lineShare', { names: escapeHtml(String(top.properties.names)), pct })}</small>`,
          );
        }
      }
      // The connection itself arrives from the worker a moment later.
      if (secs < Infinity && r) {
        tripId++;
        send({ type: 'trip', id: tripId, lat, lon: lng });
        tripSlot = '<span id="trip" class="trip"></span>';
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
    showCard(html, false, searched);
    pending = { lat, lon: lng };
    secondBtn.hidden = !state.origin;
    if (!title && map.getZoom() >= 15) void showAddress(pending);
    deps.onCard();
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

  /** The card at the bottom: minutes for a spot, or a start point with a remove button. */
  function showCard(html: string, start: boolean, searched = false) {
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
    showCard(`${mark}<b>${t(which === 1 ? 'startPoint' : 'secondPoint')}</b>`, true);
    deps.onCard();
  }

  function hideReadout() {
    readout.hidden = true;
    tripId++;
    setTrip(null);
    setSpot(null);
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
    tripId++;
    setTrip(null);
    readout.classList.add('stale');
  }

  /** Redraws the place's card now, for a change that needs no new map (language, layers). */
  function redrawSpot() {
    if (!spot || (!state.origin && !state.desert)) return hideReadout();
    // Without a map yet, the coming one redraws it.
    if (state.result || !state.origin)
      tapAt(spot.lat, spot.lon, undefined, spot.title, spot.searched);
  }

  /** A new map is in: the place's card and trip follow it. */
  function onResult() {
    if (spot) tapAt(spot.lat, spot.lon, undefined, spot.title, spot.searched);
  }

  /** Draws a journey (or clears it); while one is shown the Lines layer steps back. */
  function setTrip(trip: Pick<Trip, 'lines' | 'stops'> | null) {
    if (!state.mapReady) return;
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    (map.getSource(TRIP_SOURCE) as GeoJSONSource | undefined)?.setData(trip?.lines ?? empty);
    (map.getSource(TRIP_STOPS_SOURCE) as GeoJSONSource | undefined)?.setData(trip?.stops ?? empty);
    map.setPaintProperty('routes-line', 'line-opacity', trip ? 0.3 : 1);
    map.setPaintProperty('routes-casing', 'line-opacity', trip ? 0.2 : 0.9);
    map.setLayoutProperty('routes-label', 'visibility', state.routes && !trip ? 'visible' : 'none');
  }

  /** The journey to the tapped spot arrived from the worker. */
  function onTrip(m: Trip) {
    if (m.id !== tripId || readout.hidden) return;
    const el = document.getElementById('trip');
    if (!el) return;
    el.innerHTML = tripHtml(m, {
      starts: [state.origin, state.second],
      here: pending,
      direction: state.direction,
      travel: state.travel,
    });
    setTrip(m);
  }

  // The place becomes a start, so it no longer stays as the destination.
  $('readout-start').addEventListener('click', () => {
    const at = pending;
    hideReadout();
    if (at) deps.setOrigin(at);
  });
  secondBtn.addEventListener('click', () => {
    const at = pending;
    hideReadout();
    if (at) deps.setSecond(at);
  });
  $('readout-fav').addEventListener('click', () => {
    const at = pending;
    if (!at) return;
    hideReadout();
    deps.addFavourite(at);
  });
  removeBtn.addEventListener('click', () => deps.removeStart(removeWhich));
  $('readout-close').addEventListener('click', hideReadout);

  return {
    tapAt,
    showStartCard,
    hideReadout,
    keepSpot,
    redrawSpot,
    onResult,
    onTrip,
    /** The place kept in the link. */
    spot: (): Point | null => spot,
  };
}
