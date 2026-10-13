// The mode banners under the chip row (Treffpunkt, Vergleich, Wohnlage, Heimweg) cover
// part of the map. A few seconds after they appear they shrink to a small pill with the
// mode's name and the ✕; a tap on the pill opens the full text again for a while.

import { t } from './i18n';
import { escapeHtml } from './format';
import { icon } from './icons';
import { $ } from './state';

const COLLAPSE_MS = 5000;

/** The pill's content (HTML): the mode's name ("Treffpunkt", or "Wohnlage" from "Wohnlage: …"). */
const SHORT: Record<string, () => string> = {
  meet: () => `${icon('people', 16)} ${t('meetShort')}`,
  cmp: () => `${icon('compare', 16)} ${t('compareChipLabel')}`,
  special: () => escapeHtml($('special-text').textContent!.split(/[:,]/)[0]!),
};

export function initBanners() {
  for (const [id, short] of Object.entries(SHORT)) {
    const el = $(id);
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'banner-pill';
    el.prepend(pill);
    let timer = 0;
    const open = () => {
      clearTimeout(timer);
      el.classList.remove('small');
      timer = window.setTimeout(() => {
        pill.innerHTML = short();
        el.classList.add('small');
      }, COLLAPSE_MS);
    };
    pill.addEventListener('click', open);
    // Each time the banner appears it starts out full.
    new MutationObserver(() => {
      if (!el.hidden) open();
    }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    if (!el.hidden) open();
  }
}
