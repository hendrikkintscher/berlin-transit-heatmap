// Maps shown instead of the start's:
// "Where can I live?" shades the map by the weighted average to the favourite places,
// arriving in the chosen hour (one pass per place). "Bis wann komme ich heim?" shows, for
// home (a start or a favourite), until when a quick connection runs through the evening
// and night (passes every 15 minutes, one hourly file after the other). Both take a few
// seconds, so they run only on request, with progress; the last one is kept until its
// places or the settings change.

import type { Favourite } from './favourites';
import { nightText, whenText } from './format';
import { t } from './i18n';
import type { ToWorker } from './protocol';
import { $, type Result, type Special, type State } from './state';
import { computeWindow, eveningWindow } from './when';

/** The evening and night hours the home map reads, in order. */
const HOME_HOURS = [20, 21, 22, 23, 0, 1];

export interface SpecialDeps {
  state: State;
  send: (m: ToWorker) => void;
  favourites: () => readonly Favourite[];
  isSearchOpen: () => boolean;
  setStatus: (render: () => string) => void;
  showResult: (r: Result) => void;
  /** The start's map again. */
  compute: () => void;
  clearResult: () => void;
  closeMenu: () => void;
  /** The tapped place's card: follow a new map, keep the place, or close. */
  onResult: () => void;
  keepSpot: () => void;
  hideReadout: () => void;
}

export function initSpecialMaps(deps: SpecialDeps) {
  const { state } = deps;
  const loadbar = $('loadbar');
  const hint = $('hint');
  const chip = $('special');
  let last: { key: string; result: Result } | null = null;
  let pending = '';

  function render() {
    const s = state.special;
    chip.hidden = !s;
    document.body.classList.toggle('special', !!s);
    // The "tap the map or search a start" hint would sit on the banner.
    hint.hidden = !!s || !!state.origin || deps.isSearchOpen();
    if (!s) return;
    $('special-text').textContent =
      s.kind === 'living'
        ? t('living', { count: deps.favourites().length, when: whenText(state.when, 'arrive') })
        : t('home', {
            name: s.name,
            night: nightText(state.when.day),
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
      return deps.favourites().length
        ? {
            type: 'living',
            window: computeWindow(state.when, 'arrive'),
            places: deps.favourites().map((f) => ({ lat: f.lat, lon: f.lon, weight: f.weight })),
            ...how,
          }
        : null;
    if (s?.kind === 'home')
      return {
        type: 'home',
        windows: HOME_HOURS.map((hour) => eveningWindow(state.when.day, hour)),
        lat: s.at.lat,
        lon: s.at.lon,
        ...how,
      };
    return null;
  }

  function progress(done: number, total: number) {
    const i = Math.min(done + 1, total);
    const key = state.special?.kind === 'home' ? 'homeProgress' : 'livingProgress';
    deps.setStatus(() => t(key, { i, n: total }));
  }

  function run() {
    const req = request();
    if (!req) return show(null);
    const key = JSON.stringify(req);
    render();
    state.requestId++;
    if (last?.key === key) {
      state.result = last.result;
      deps.showResult(last.result);
      deps.onResult();
      loadbar.hidden = true;
      return;
    }
    pending = key;
    loadbar.hidden = false;
    loadbar.classList.remove('indeterminate');
    (loadbar.firstElementChild as HTMLElement).style.width = '0%';
    progress(0, req.type === 'home' ? req.windows.length : req.places.length);
    deps.send({ ...req, id: state.requestId });
  }

  /** Shows a special map (computing it) or none (back to the start's map, if any). */
  function show(s: Special | null) {
    if (JSON.stringify(s) === JSON.stringify(state.special)) return;
    state.special = s;
    render();
    if (s) {
      deps.hideReadout();
      run();
    } else if (state.origin) {
      deps.keepSpot();
      deps.compute();
    } else {
      deps.hideReadout();
      deps.clearResult();
    }
  }

  $('special-close').addEventListener('click', () => show(null));
  $('fav-living').addEventListener('click', () => {
    deps.closeMenu();
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
}
