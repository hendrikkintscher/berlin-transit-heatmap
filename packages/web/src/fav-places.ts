// Favourite places: the list in the menu (rename, weight, remove, import and export),
// their stars on the map with the minutes from the start, and the average-time chip.

import maplibregl from 'maplibre-gl';
import {
  favouriteAt,
  loadFavourites,
  newId,
  parseImport,
  saveFavourites,
  score,
  WEIGHTS,
  type Favourite,
  type Weight,
} from './favourites';
import { gridSeconds } from './format';
import { icon } from './icons';
import { lang, t } from './i18n';
import { region } from './region';
import { reverseStreet, searchPlaces, type Place } from './search';
import { $, type State } from './state';
import type { Point } from './url';

export interface FavouriteDeps {
  map: maplibregl.Map;
  state: State;
  /** Recomputes the map (the where-to-live map reads the list). */
  compute: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  /** Opens the search to add a place. */
  openSearch: () => void;
  /** "Bis wann komme ich heim?" to a favourite place. */
  showHome: (f: Favourite) => void;
}

export function initFavouritePlaces(deps: FavouriteDeps) {
  const { map, state } = deps;
  let favourites = loadFavourites();
  const favChip = $<HTMLButtonElement>('fav-score');
  const favList = $<HTMLUListElement>('fav-list');
  const favMarkers = new Map<string, maplibregl.Marker>();

  function addFavourites(places: { label: string; lat: number; lon: number }[]): Favourite[] {
    const added = places.map((p) => ({
      id: newId(),
      label: p.label,
      lat: p.lat,
      lon: p.lon,
      weight: 2 as Weight,
    }));
    favourites = [...favourites, ...added];
    favouritesChanged();
    return added;
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
    if (state.special?.kind === 'living') deps.compute();
  }

  /** Redraws the list in the menu, the star markers on the map and the score chip. */
  function renderFavourites() {
    const times = favouriteTimes();
    favList.replaceChildren(
      ...favourites.map((f, i) => {
        const li = document.createElement('li');
        // The name is a text field: tap it to rename the place (C7).
        const name = document.createElement('input');
        name.className = 'fav-name';
        name.value = f.label;
        name.enterKeyHint = 'done';
        name.setAttribute('aria-label', t('favName'));
        name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
        name.addEventListener('change', () => {
          const label = name.value.trim();
          if (label && label !== f.label) {
            f.label = label;
            favouritesChanged();
          } else name.value = f.label;
        });
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
        home.innerHTML = icon('moon', 18);
        home.setAttribute('aria-label', t('homeFav', { name: f.label }));
        home.title = t('homeFav', { name: f.label });
        home.addEventListener('click', () => {
          deps.closeMenu();
          deps.showHome(f);
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
      favChip.textContent = t(favourites.length > 1 ? 'favScore' : 'favScore1', {
        n: times.average,
        count: favourites.length,
      });
    }
  }

  favChip.addEventListener('click', () => {
    deps.openMenu();
    $('fav-title').scrollIntoView({ block: 'start' });
  });
  $('fav-add').addEventListener('click', () => {
    deps.closeMenu();
    deps.openSearch();
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
            { lat: region.center[1], lon: region.center[0] },
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

  return {
    list: (): readonly Favourite[] => favourites,
    add: addFavourites,
    render: renderFavourites,
    isAt: (at: Point) => !!favouriteAt(favourites, at),
    /** Adds the point as a favourite place, or removes the one there. */
    toggle: (at: Point) => {
      const there = favouriteAt(favourites, at);
      if (there) {
        favourites = favourites.filter((f) => f !== there);
        favouritesChanged();
        return;
      }
      // In the list at once, under its coordinates; the street name follows when Photon answers.
      const [f] = addFavourites([{ label: `${at.lat.toFixed(4)}, ${at.lon.toFixed(4)}`, ...at }]);
      reverseStreet(at, lang())
        .then((label) => {
          if (label && f && favourites.includes(f)) {
            f.label = label;
            favouritesChanged();
          }
        })
        .catch(() => {
          // Offline or Photon down: keep the coordinates as the name.
        });
    },
  };
}
