// The menu (favourites, sharing, installing, the language and the info sheet) and the
// settings in the Unterwegs and Ebenen panels: how you get around, Stufenlos, Gehtempo, the
// map layers and the opacity.

import { setLang, t, type Lang } from './i18n';
import { $, remember, type State } from './state';
import { TRAVELS, travelOf } from './url';
import { whenParam } from './when';

/** Baked in by the build (vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

export interface MenuDeps {
  state: State;
  writeUrl: () => void;
  closeSearch: () => void;
  /** Mehr opened (a failed changes file is fetched again). */
  opened?: () => void;
  /** Unterwegs or Stufenlos changed: the pill, the tapped place and the map follow. */
  travelChanged: () => void;
  /** The walking speed changed: walks and the walk-based layers are redone. */
  walkChanged: () => void;
  /** The stop-frequency or desert layer was switched. */
  layerChanged: () => void;
  /** Lines or outlines switched: show or hide their map layers. */
  setLayerVisible: (layers: 'routes' | 'outlines', on: boolean) => void;
  opacityChanged: () => void;
  /** The Heatmap switch changed: show or hide the colours, restyle the outlines. */
  heatChanged: () => void;
  /** "Bis N Min." switched (`toggled`) or set to other minutes: the image is painted again. */
  limitChanged: (toggled: boolean) => void;
  /** The language changed: everything with text is redrawn. */
  langChanged: () => void;
  setStatus: (render: () => string, fade?: boolean) => void;
  install: () => void;
  /** A meeting point's suggestions and everyone's minutes, for the shared message. */
  shareText: () => string | null;
}

export function initMenu(deps: MenuDeps) {
  const { state } = deps;
  const menuDialog = $<HTMLDialogElement>('menu');
  const infoDialog = $<HTMLDialogElement>('info');
  const langButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-lang]')];
  const travelButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-travel]')];
  const walkButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-walk]')];
  const routesToggle = $<HTMLInputElement>('routes-toggle');
  const freqToggle = $<HTMLInputElement>('freq-toggle');
  const desertToggle = $<HTMLInputElement>('desert-toggle');
  const isoToggle = $<HTMLInputElement>('iso-toggle');
  const heatToggle = $<HTMLInputElement>('heat-toggle');
  const stepFreeToggle = $<HTMLInputElement>('stepfree-toggle');
  const opacityInput = $<HTMLInputElement>('opacity');
  const limitToggle = $<HTMLInputElement>('limit-toggle');
  const limitButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-limit]')];

  // The version line in the menu's language, the short commit as visible text (no tooltip on a phone).
  const versionLine = $('app-version');
  function renderVersion() {
    versionLine.textContent = t(__APP_COMMIT__ ? 'appVersion' : 'appVersionNoCommit', {
      version: __APP_VERSION__,
      commit: __APP_COMMIT__,
    });
  }
  renderVersion();

  function openMenu() {
    menuDialog.showModal();
    deps.opened?.();
  }
  const menuBtn = $('menu-btn');
  menuBtn.addEventListener('click', () => {
    deps.closeSearch();
    openMenu();
    menuBtn.setAttribute('aria-expanded', 'true');
  });
  menuDialog.addEventListener('close', () => menuBtn.setAttribute('aria-expanded', 'false'));
  $('menu-close').addEventListener('click', () => menuDialog.close());
  $('about-btn').addEventListener('click', () => {
    menuDialog.close();
    infoDialog.showModal();
  });
  // A tap on the backdrop (outside the panel) closes any sheet. The dialog itself is also
  // the target of a tap in its padding, so the point is checked against its box.
  for (const d of [menuDialog, infoDialog]) {
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) d.close();
    });
  }

  // ---------- how you get around ----------
  function renderTravel() {
    for (const b of travelButtons)
      b.setAttribute('aria-checked', String(b.dataset.travel === state.travel));
  }
  for (const b of travelButtons)
    b.addEventListener('click', () => {
      const travel = travelOf(b.dataset.travel ?? null);
      if (travel === state.travel) return;
      state.travel = travel;
      remember('travel', String(TRAVELS.indexOf(travel)));
      renderTravel();
      deps.travelChanged();
    });
  renderTravel();

  stepFreeToggle.checked = state.stepFree;
  stepFreeToggle.addEventListener('change', () => {
    state.stepFree = stepFreeToggle.checked;
    remember('step-free', state.stepFree ? '1' : '0');
    deps.travelChanged();
  });

  function renderWalk() {
    for (const b of walkButtons)
      b.setAttribute('aria-checked', String(Number(b.dataset.walk) === state.walkKmh));
  }
  for (const b of walkButtons)
    b.addEventListener('click', () => {
      const kmh = Number(b.dataset.walk);
      if (kmh === state.walkKmh) return;
      state.walkKmh = kmh;
      remember('walk-kmh', String(kmh));
      renderWalk();
      deps.writeUrl();
      deps.walkChanged();
    });
  renderWalk();

  // ---------- map layers ----------
  routesToggle.checked = state.routes;
  routesToggle.addEventListener('change', () => {
    state.routes = routesToggle.checked;
    deps.setLayerVisible('routes', state.routes);
    deps.writeUrl();
  });
  for (const [toggle, name] of [
    [freqToggle, 'freq'],
    [desertToggle, 'desert'],
  ] as const) {
    toggle.checked = state[name];
    toggle.addEventListener('change', () => {
      state[name] = toggle.checked;
      deps.layerChanged();
      deps.writeUrl();
    });
  }
  isoToggle.checked = state.iso;
  isoToggle.addEventListener('change', () => {
    state.iso = isoToggle.checked;
    deps.setLayerVisible('outlines', state.iso);
    deps.writeUrl();
  });
  // The time lines' hint says what is drawn: rings alone, a line every 5 minutes with colours.
  const isoHint = isoToggle.closest('label')!.querySelector('small')!;
  function renderIsoHint() {
    const key = state.heat || state.limit ? 'isoHintHeat' : 'isoHint';
    isoHint.dataset.t = key;
    isoHint.textContent = t(key);
  }
  heatToggle.checked = state.heat;
  opacityInput.disabled = !state.heat && !state.limit;
  renderIsoHint();
  heatToggle.addEventListener('change', () => {
    state.heat = heatToggle.checked;
    opacityInput.disabled = !state.heat && !state.limit;
    renderIsoHint();
    deps.heatChanged();
    deps.writeUrl();
  });

  // "Bis N Min.": the minutes stay picked while it is off, and picking some turns it on.
  let limitMinutes = state.limit || 30;
  function renderLimit() {
    limitToggle.checked = state.limit > 0;
    opacityInput.disabled = !state.heat && !state.limit;
    renderIsoHint();
    // While it is off no minutes look picked.
    for (const b of limitButtons) {
      b.textContent = `${b.dataset.limit} ${t('min')}`;
      b.setAttribute(
        'aria-checked',
        String(state.limit > 0 && Number(b.dataset.limit) === limitMinutes),
      );
    }
  }
  function setLimit(minutes: number) {
    if (minutes === state.limit) return;
    const toggled = !minutes !== !state.limit;
    state.limit = minutes;
    if (minutes) limitMinutes = minutes;
    renderLimit();
    deps.limitChanged(toggled);
    deps.writeUrl();
  }
  limitToggle.addEventListener('change', () => setLimit(limitToggle.checked ? limitMinutes : 0));
  for (const b of limitButtons)
    b.addEventListener('click', () => setLimit(Number(b.dataset.limit)));
  renderLimit();
  opacityInput.value = String(state.opacity);
  opacityInput.addEventListener('input', () => {
    state.opacity = Number(opacityInput.value);
    remember('heat-opacity', opacityInput.value);
    deps.opacityChanged();
  });

  // ---------- share and install ----------
  $('share-btn').addEventListener('click', async () => {
    // A shared map keeps its time, even when that is the current one here.
    const shared = new URL(location.href);
    shared.searchParams.set('t', whenParam(state.when));
    const url = shared.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('title'), text: deps.shareText() ?? t('shareText'), url });
        menuDialog.close();
      } catch {
        // Cancelled by the user.
      }
      return;
    }
    try {
      const text = deps.shareText();
      await navigator.clipboard.writeText(text ? `${text}\n${url}` : url);
      menuDialog.close();
      deps.setStatus(() => t('linkCopied'), true);
    } catch {
      prompt(t('share'), url);
    }
  });
  $('install-btn').addEventListener('click', () => {
    menuDialog.close();
    deps.install();
  });

  // ---------- language ----------
  function applyLang(l: Lang, remember: boolean) {
    setLang(l, remember);
    for (const b of langButtons) b.setAttribute('aria-checked', String(b.dataset.lang === l));
    deps.langChanged();
    renderLimit();
    renderVersion();
  }
  for (const b of langButtons)
    b.addEventListener('click', () => {
      applyLang(b.dataset.lang as Lang, true);
      deps.writeUrl();
    });

  return {
    applyLang,
    open: openMenu,
    close: () => menuDialog.close(),
  };
}
