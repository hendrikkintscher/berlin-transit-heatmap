// The chip row under the top bar: Zeit, Unterwegs, Reisezeit, Ebenen, Stufenlos and
// Vergleich show at a glance what is set (a chip that differs from the default is purple).
// A tap opens that chip's small panel right under the row, with only its own settings;
// the map stays visible, and a tap outside closes it.

import { t } from './i18n';
import { $, type State } from './state';
import { DEFAULT_WALK_KMH } from './url';

export type Pop = 'when' | 'travel' | 'measure' | 'layers' | 'compare';

export interface ChipsDeps {
  state: State;
  /** Opening a panel closes the search. */
  closeSearch: () => void;
  /** The text of the compared time, e.g. "Mi 14. 2 Uhr". */
  compareText: () => string;
}

export function initChips({ state, closeSearch, compareText }: ChipsDeps) {
  const row = $('chips');
  const pops = $('pops');
  const stepFree = $<HTMLInputElement>('stepfree-toggle');
  let open: Pop | null = null;

  const panel = (p: Pop) => $(`pop-${p}`);
  const chipOf = (p: Pop) => row.querySelector<HTMLElement>(`[data-pop="${p}"]`);

  function show(p: Pop | null) {
    if (open) {
      panel(open).hidden = true;
      chipOf(open)?.setAttribute('aria-expanded', 'false');
    }
    open = p;
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
    const p = chip.dataset.pop as Pop | '';
    if (!p) {
      // Stufenlos switches at once; its switch in the Unterwegs panel follows.
      show(null);
      stepFree.checked = !stepFree.checked;
      stepFree.dispatchEvent(new Event('change'));
      return;
    }
    show(open === p ? null : p);
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

  /** Chip labels and which ones differ from the default. */
  function render() {
    const set = (id: string, text: string, on: boolean) => {
      const chip = $(id);
      chip.querySelector('span')!.textContent = text;
      chip.classList.toggle('on', on);
    };
    set(
      'travel-chip',
      t(
        state.travel === 'bike'
          ? 'travelBike'
          : state.travel === 'bikeonly'
            ? 'travelBikeOnly'
            : 'travelWalk',
      ),
      state.travel !== 'walk' || state.walkKmh !== DEFAULT_WALK_KMH,
    );
    set(
      'measure-chip',
      t(
        state.measure === 'typical'
          ? 'measureTypical'
          : state.measure === 'best'
            ? 'measureBest'
            : 'measureNext',
      ),
      state.measure !== 'next',
    );
    set(
      'layers-chip',
      t('layersChip'),
      state.heat || state.freq || state.desert || !state.routes || !state.iso,
    );
    set('stepfree-chip', t('stepFree'), state.stepFree);
    $('stepfree-chip').setAttribute('aria-pressed', String(state.stepFree));
    set(
      'compare-chip',
      state.compare ? t('compareOn', { when: compareText() }) : t('compareChipLabel'),
      !!state.compare,
    );
  }

  return { show, render, close: () => show(null), isOpen: () => open };
}
