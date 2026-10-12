// The chip row under the search bar: Zeit (with Reisezeit), Bahn (with Barrierefrei),
// then Ebenen (with Vergleich) and Mehr (the menu) as icons, so the row fits a phone
// without scrolling. They show at a glance what is set (a chip that differs from the
// default is purple). A tap opens that
// chip's small panel right under the row, with only its own settings; the map stays
// visible, and a tap outside closes it.

import { t } from './i18n';
import { $, type State } from './state';
import { DEFAULT_WALK_KMH } from './url';

export type Pop = 'when' | 'travel' | 'layers';

export interface ChipsDeps {
  state: State;
  /** Opening a panel closes the search. */
  closeSearch: () => void;
}

export function initChips({ state, closeSearch }: ChipsDeps) {
  const row = $('chips');
  const pops = $('pops');
  let open: Pop | null = null;

  const scroller = row.querySelector<HTMLElement>('.chip-scroll')!;
  const panel = (p: Pop) => $(`pop-${p}`);
  /** Back to the start of the row, so search and Zeit are in view again. */
  const scrollHome = () => scroller.scrollTo({ left: 0, behavior: 'smooth' });
  const chipOf = (p: Pop) => row.querySelector<HTMLElement>(`[data-pop="${p}"]`);

  function show(p: Pop | null) {
    if (open) {
      panel(open).hidden = true;
      chipOf(open)?.setAttribute('aria-expanded', 'false');
    }
    const closing = open !== null && !p;
    open = p;
    if (closing) scrollHome();
    if (!p) return;
    closeSearch();
    panel(p).hidden = false;
    chipOf(p)?.setAttribute('aria-expanded', 'true');
    // Keep the open chip in view when the row is scrolled.
    chipOf(p)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  row.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip-btn');
    if (!chip) return;
    const p = chip.dataset.pop as Pop | undefined;
    // Mehr opens the menu (menu.ts).
    show(!p || open === p ? null : p);
  });
  // A tap anywhere else closes the panel.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!open) return;
      const el = e.target as Node;
      if (pops.contains(el) || row.contains(el)) return;
      show(null);
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) show(null);
  });
  // Mehr (the last chip) opens the menu: closing it scrolls the row back too.
  $('menu').addEventListener('close', scrollHome);

  /** Chip labels and which ones differ from the default. */
  function render() {
    const set = (id: string, text: string, on: boolean) => {
      const chip = $(id);
      // Icon-only chips (Ebenen, Mehr) carry their name as the label.
      const label = chip.querySelector('span');
      if (label) label.textContent = text;
      else chip.setAttribute('aria-label', text);
      chip.classList.toggle('on', on);
    };
    set(
      'travel-chip',
      (state.stepFree ? '♿ ' : '') +
        t(
          state.travel === 'bike'
            ? 'travelBike'
            : state.travel === 'bikeonly'
              ? 'travelBikeOnly'
              : 'travelWalk',
        ),
      state.travel !== 'walk' || state.walkKmh !== DEFAULT_WALK_KMH || state.stepFree,
    );
    set(
      'layers-chip',
      t('layersChip'),
      state.heat ||
        !!state.limit ||
        state.freq ||
        state.desert ||
        !state.routes ||
        !state.iso ||
        !!state.compare,
    );
  }

  return { show, render, close: () => show(null), isOpen: () => open };
}
