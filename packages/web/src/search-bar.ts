// The address search: the bar at the top and its suggestions (recent searches, favourite
// places, stations and streets at once, then Photon's results), a picked street's house
// numbers, and what a picked place does: set the start, add a favourite place or one more start.

import type maplibregl from 'maplibre-gl';
import { send } from './boot';
import { dataUrl } from './data-url';
import type { Favourite } from './favourites';
import { lang, t } from './i18n';
import { dataBase } from './region';
import { searchPlaces, streetHouses, type Place } from './search';
import {
  loadRecent,
  localMatches,
  matchScore,
  parseStreetLines,
  rememberRecent,
  streetMatches,
  withoutLocal,
  withRemoteDetail,
  type LocalPlace,
  type LocalStreet,
  type StreetsFile,
} from './search-local';
import { $, type State } from './state';
import type { Point } from './url';

/** What a picked search result does: set the start, add a favourite place or one more start. */
export type SearchPurpose = 'start' | 'favourite' | 'another';

export interface SearchDeps {
  map: maplibregl.Map;
  state: State;
  starts: () => Point[];
  favourites: () => readonly Favourite[];
  closeChips: () => void;
  setOrigin: (p: Point) => void;
  addStart: (p: Point) => void;
  /** Adds a favourite place and shows the list. */
  addFavourite: (p: { label: string; lat: number; lon: number }) => void;
  frameView: (points: Point[], card: boolean) => void;
  tapAt: (lat: number, lon: number, id: undefined, title: string, searched: boolean) => void;
}

export function initSearch(deps: SearchDeps) {
  const { map, state } = deps;
  const hint = $('hint');
  let searchFor: SearchPurpose = 'start';
  const searchPanel = $('search');
  const searchInput = $<HTMLInputElement>('search-input');
  const searchResults = $<HTMLUListElement>('search-results');
  const searchMsg = $('search-msg');
  const searchClose = $<HTMLButtonElement>('search-close');
  /** The bar is always there; open means its suggestions show under it. */
  const isSearchOpen = () => searchPanel.classList.contains('open');
  let searchTimer = 0;
  let searchAbort: AbortController | null = null;
  let places: Place[] = [];
  let active = -1;
  const searchCache = new Map<string, Place[]>();
  /** Stations of the loaded timetable, asked from the worker when the search first opens. */
  let searchStations: LocalPlace[] | null = null;
  let stationsAsked = false;
  /** The region's streets (streets.json), loaded when the search first opens. */
  const searchStreets: LocalStreet[] = [];
  let streetsAsked = false;
  /** Photon's last answer, kept on screen (filtered) while the next one is on its way. */
  let lastRemote: Place[] = [];
  /**
   * A street picked from the suggestions: the address search's second step, its house
   * numbers (in that street's postcode). Ends when the text no longer starts with the street.
   */
  let streetPick: Place | null = null;
  /** The text after the picked street's name, or null when no street is picked. */
  function houseQuery(): string | null {
    const v = searchInput.value;
    if (!streetPick?.street || !v.startsWith(streetPick.street.name)) return null;
    return v.slice(streetPick.street.name.length).trim();
  }

  /** The search's title and placeholder for what it is for (C6): a start, a favourite, another start. */
  function labelSearch(purpose = searchFor) {
    const title = $('search-title');
    title.hidden = purpose === 'start';
    title.textContent =
      purpose === 'favourite'
        ? t('searchFavTitle')
        : purpose === 'another'
          ? t('searchAnotherTitle', { n: deps.starts().length + 1 })
          : '';
    searchInput.placeholder = t(
      purpose === 'favourite'
        ? 'searchFavPlaceholder'
        : purpose === 'another'
          ? 'searchAnotherPlaceholder'
          : 'searchPlaceholder',
    );
  }

  function openSearch() {
    labelSearch();
    deps.closeChips();
    searchPanel.classList.add('open');
    searchClose.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    hint.hidden = true;
    searchInput.focus();
    searchInput.select();
    if (!stationsAsked) {
      stationsAsked = true;
      send({ type: 'stations', window: state.window });
    }
    if (!streetsAsked) {
      streetsAsked = true;
      fetch(dataUrl(dataBase(), 'streets.json'))
        .then((r) => (r.ok ? r.json() : null))
        .then((file: StreetsFile | null) => {
          if (!file) return;
          // A few thousand lines at a time, so opening the keyboard and typing stay smooth.
          const lines = file.streets.split('\n');
          const step = (from: number) => {
            searchStreets.push(...parseStreetLines(file.box, lines.slice(from, from + 2000)));
            if (from + 2000 < lines.length) setTimeout(() => step(from + 2000));
            else if (isSearchOpen()) showSuggestions();
          };
          step(0);
        })
        .catch(() => {
          // No street list: streets still come from Photon.
          streetsAsked = false;
        });
    }
    showSuggestions();
  }

  /** Recent searches, favourite places and stations: everything matched without the network. */
  function localPool(): LocalPlace[] {
    return [
      ...loadRecent(),
      ...deps.favourites().map((f) => ({
        label: f.label,
        detail: '',
        lat: f.lat,
        lon: f.lon,
        kind: 'favourite' as const,
      })),
      ...(searchStations ?? []),
    ];
  }

  /** Local matches at once, then Photon's results that still fit the query. */
  function showSuggestions(remote = lastRemote) {
    const q = searchInput.value.trim();
    const house = houseQuery();
    if (streetPick?.street && house !== null) {
      // The street's houses for the typed number, and the street itself to pick as is.
      const { label, detail, lat, lon } = streetPick;
      const whole = { label, detail, lat, lon };
      renderPlaces(
        [...(house ? streetHouses(remote, streetPick.street, streetPick) : []), whole].slice(0, 8),
      );
      showMsg(house ? '' : t('houseNumberHint'));
      return;
    }
    const c = map.getCenter();
    const local = [
      ...localMatches(q, localPool(), q.length >= 3 ? 3 : 5),
      ...withRemoteDetail(streetMatches(q, searchStreets, { lat: c.lat, lon: c.lng }), remote),
    ];
    const fitting = remote.filter((p) => matchScore(`${p.label} ${p.detail}`, q) > 0);
    const list = [...local, ...withoutLocal(fitting, local)].slice(0, 8);
    renderPlaces(list);
    if (list.length) showMsg('');
  }
  function closeSearch() {
    // Closed, the bar reads as the start search again (what a picked result does is kept).
    labelSearch('start');
    searchPanel.classList.remove('open');
    searchClose.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    hint.hidden = !!state.origin || !!state.special;
    searchAbort?.abort();
    clearTimeout(searchTimer);
    searchInput.blur();
  }
  function showMsg(text: string) {
    searchMsg.textContent = text;
    searchMsg.hidden = !text;
  }
  function renderPlaces(list: (Place | LocalPlace)[]) {
    places = list;
    active = -1;
    searchResults.replaceChildren(
      ...list.map((p, i) => {
        const li = document.createElement('li');
        li.id = `place-${i}`;
        if ('kind' in p) li.className = `place-${p.kind}`;
        else if (p.street) li.className = 'place-street';
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
    // After a picked street: its houses, in its postcode ("Torstraße 12, 10119").
    const picked = houseQuery() ? streetPick : null;
    const street = picked?.street;
    if (street) q = [`${street.name} ${houseQuery()}`, street.postcode].filter(Boolean).join(', ');
    // Houses are asked for around the picked street: there may be twenty of that name.
    const c = picked ? { lat: picked.lat, lng: picked.lon } : map.getCenter();
    const key = `${picked ? `house:${picked.lat},${picked.lon}:` : ''}${q.toLowerCase()}`;
    const cached = searchCache.get(key);
    if (cached) {
      lastRemote = cached;
      showSuggestions();
      if (!places.length) showMsg(t('noMatches'));
      return;
    }
    searchAbort?.abort();
    const ctrl = (searchAbort = new AbortController());
    try {
      const list = await searchPlaces(
        q,
        { lat: c.lat, lon: c.lng },
        ctrl.signal,
        lang(),
        street ? 'house' : undefined,
      );
      searchCache.set(key, list);
      if (ctrl.signal.aborted) return;
      lastRemote = list;
      showSuggestions();
      if (!places.length) showMsg(t('noMatches'));
    } catch {
      if (ctrl.signal.aborted) return;
      // Local matches stay; only say so when there is nothing at all.
      if (!places.length) showMsg(t(navigator.onLine ? 'searchDown' : 'searchOffline'));
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (streetPick && houseQuery() === null) {
      streetPick = null;
      lastRemote = [];
    }
    // Local suggestions on every keystroke, before any network.
    showSuggestions();
    if (streetPick) {
      // A house number typed after the picked street: ask for its houses.
      if (houseQuery()) searchTimer = window.setTimeout(() => runSearch(q), 150);
      return;
    }
    if (q.length < 3) {
      searchAbort?.abort();
      lastRemote = [];
      showMsg('');
      return;
    }
    // A typed word answered before: show it at once, otherwise ask Photon after a short pause.
    if (searchCache.has(q.toLowerCase())) runSearch(q);
    else searchTimer = window.setTimeout(() => runSearch(q), 150);
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

  /** The zoom that shows about 7 km around a point across the map's narrow side. */
  function reachZoom(lat: number): number {
    const side = Math.min(map.getContainer().clientWidth, map.getContainer().clientHeight);
    const metresPerPixelZ0 = 156543 * Math.cos((lat * Math.PI) / 180);
    return Math.min(13, Math.log2(((side / 2) * metresPerPixelZ0) / 7000));
  }

  function pickPlace(p: Place) {
    if (p.street) {
      // A street: on to its house numbers (or pick the whole street, offered first).
      streetPick = p;
      lastRemote = [];
      searchInput.value = `${p.street.name} `;
      searchInput.focus();
      showSuggestions();
      return;
    }
    streetPick = null;
    closeSearch();
    rememberRecent(p);
    if (searchFor === 'favourite') {
      searchFor = 'start';
      searchInput.value = '';
      deps.addFavourite({ label: p.label, lat: p.lat, lon: p.lon });
      return;
    }
    if (searchFor === 'another') {
      searchFor = 'start';
      searchInput.value = '';
      deps.addStart({ lat: p.lat, lon: p.lon });
      return;
    }
    // The bar empties again: the place shows on the map and in its card.
    searchInput.value = '';
    // With a start set, the place may be a new start, a destination or another start:
    // show the trip there, with buttons for the other two, and the starts with it in view.
    if (state.origin && state.result) {
      deps.frameView([...deps.starts(), p], true);
      deps.tapAt(p.lat, p.lon, undefined, p.label, true);
    } else {
      // Far enough out for about the 45-minute ring around the new start (C8).
      map.flyTo({ center: [p.lon, p.lat], zoom: reachZoom(p.lat) });
      deps.setOrigin(p);
    }
  }

  // A tap into the bar searches for a start (the other searches open it themselves).
  searchInput.addEventListener('focus', () => {
    if (isSearchOpen()) return;
    searchFor = 'start';
    openSearch();
  });
  searchClose.addEventListener('click', () => {
    searchFor = 'start';
    searchInput.value = '';
    streetPick = null;
    closeSearch();
  });
  for (const ev of ['mousedown', 'touchstart'] as const) {
    map.on(ev, () => {
      if (isSearchOpen()) closeSearch();
    });
  }

  return {
    panel: searchPanel,
    isOpen: isSearchOpen,
    /** Opens the search, for a purpose when given (else the one it had). */
    open: (purpose?: SearchPurpose) => {
      if (purpose) searchFor = purpose;
      openSearch();
    },
    close: closeSearch,
    /** The loaded timetable's stations, as the worker lists them. */
    setStations: (list: LocalPlace[]) => {
      searchStations = list;
      if (isSearchOpen()) showSuggestions();
    },
    /** The language changed: Photon's answers are asked again. */
    clearCache: () => searchCache.clear(),
  };
}
