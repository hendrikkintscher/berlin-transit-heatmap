// The menu (favourites, sharing, installing, the language and the info sheet) and the
// settings in the Unterwegs and Ebenen panels: how you get around, Stufenlos, Gehtempo, the
// map layers and the opacity.

import { setLang, t, type Lang } from './i18n';
import { $, remember, type State } from './state';
import { TRAVELS, travelOf } from './url';

export interface MenuDeps {
  state: State;
  writeUrl: () => void;
  closeSearch: () => void;
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
  /** The language changed: everything with text is redrawn. */
  langChanged: () => void;
  setStatus: (render: () => string, fade?: boolean) => void;
  install: () => void;
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

  $('menu-btn').addEventListener('click', () => {
    deps.closeSearch();
    menuDialog.showModal();
  });
  $('menu-close').addEventListener('click', () => menuDialog.close());
  $('about-btn').addEventListener('click', () => {
    menuDialog.close();
    infoDialog.showModal();
  });
  // A tap on the backdrop (outside the panel) closes any sheet.
  for (const d of [menuDialog, infoDialog]) {
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
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
  heatToggle.checked = state.heat;
  opacityInput.disabled = !state.heat;
  heatToggle.addEventListener('change', () => {
    state.heat = heatToggle.checked;
    opacityInput.disabled = !state.heat;
    deps.heatChanged();
    deps.writeUrl();
  });
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
    shared.searchParams.set('t', state.window);
    const url = shared.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('title'), text: t('shareText'), url });
        menuDialog.close();
      } catch {
        // Cancelled by the user.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
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
  }
  for (const b of langButtons)
    b.addEventListener('click', () => {
      applyLang(b.dataset.lang as Lang, true);
      deps.writeUrl();
    });

  return {
    applyLang,
    open: () => menuDialog.showModal(),
    close: () => menuDialog.close(),
  };
}
