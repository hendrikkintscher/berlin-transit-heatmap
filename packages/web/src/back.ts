// Android Back (and the browser's back button) closes what is open instead of leaving
// the app. While any layer (a sheet, the search, a chip panel, the trip card) is open, the
// history holds one extra entry with the same URL; Back pops it and closes the top-most
// layer. When the last layer closes some other way, that entry is popped again, so Back
// never needs two presses. Link updates go through replaceUrl and only touch the top entry.

export interface Layer {
  isOpen: () => boolean;
  close: () => void;
}

const MARK = 'layer';

/** Layers, top-most first. */
const layers: Layer[] = [];
let pushed = history.state?.[MARK] === true;
/** Pops we caused ourselves, which close nothing. */
let ownPops = 0;
let url = location.href;
let queued = false;

const anyOpen = () => layers.some((l) => l.isOpen());

function sync() {
  queued = false;
  if (anyOpen() === pushed) return;
  if (pushed) {
    pushed = false;
    ownPops++;
    history.back();
  } else {
    pushed = true;
    history.pushState({ [MARK]: true }, '', url);
  }
}

/** Opening or closing a layer: checked once, after the current task's changes. */
function changed() {
  if (queued) return;
  queued = true;
  queueMicrotask(sync);
}

/**
 * Registers the layers, top-most first, and the elements whose `watch` attributes change
 * when one of them opens or closes.
 */
export function initBack(list: Layer[], watch: [Element, string][]) {
  layers.push(...list);
  const observer = new MutationObserver(changed);
  for (const [el, attr] of watch) observer.observe(el, { attributeFilter: [attr] });
  window.addEventListener('popstate', () => {
    // The entry below ours carries the URL from when the layer opened: keep the current one.
    history.replaceState(history.state, '', url);
    if (ownPops) {
      ownPops--;
      changed();
      return;
    }
    if (history.state?.[MARK] === true) {
      // Forward onto our entry again: keep it only while something is open.
      pushed = true;
      changed();
      return;
    }
    if (!pushed) return;
    pushed = false;
    layers.find((l) => l.isOpen())?.close();
    changed();
  });
  changed();
}

/** Writes the link into the current history entry (never adds one). */
export function replaceUrl(next: string) {
  history.replaceState(history.state, '', next);
  url = location.href;
}
