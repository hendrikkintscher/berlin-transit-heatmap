// The app's entry: takes over the routing worker that the start page's inline script
// started (see vite.config.ts; with a start in the link it already asked for the first
// map's timetable), or starts it here, then loads the rest of the app (most of it the map
// library) next to them. main.ts takes the worker over. Without a start the timetable
// waits until the app has loaded, so it does not hold up the map.
// Styles come with the entry, so the page never shows unstyled while main.ts loads.
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { FromWorker, ToWorker } from './protocol';
import { dataBase } from './region';
import { earlyLoad, linkHasStart } from './early';
import { pageDataVersions, setDataVersions } from './data-url';

declare global {
  interface Window {
    /** Set by the start page: the worker it started and the messages it got so far. */
    __boot?: { worker: Worker; early: MessageEvent<FromWorker>[] };
  }
}

const started = window.__boot;
export const worker =
  started?.worker ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
export const send = (m: ToWorker) => worker.postMessage(m);

/** Messages that arrive before the app listens, handed over by listen(). */
const early: MessageEvent<FromWorker>[] = started?.early ?? [];
worker.onmessage = (ev: MessageEvent<FromWorker>) => early.push(ev);

/** Asks for the first map's timetable, prepared as the link and the device's settings say. */
function loadFirst() {
  let stored = { stepFree: null as string | null, travel: null as string | null };
  try {
    stored = {
      stepFree: localStorage.getItem('step-free'),
      travel: localStorage.getItem('travel'),
    };
  } catch {
    // Storage blocked: the defaults.
  }
  send({ type: 'load', ...earlyLoad(location.search, stored) });
}

setDataVersions(pageDataVersions());
const withStart = linkHasStart(location.search);
if (!started) {
  send({ type: 'init', dataBase: dataBase(), v: pageDataVersions() });
  if (withStart) loadFirst();
}

/** Hands the worker's messages to `handler`, the early ones first, once main.ts has run. */
export function listen(handler: (ev: MessageEvent<FromWorker>) => void): void {
  setTimeout(() => {
    for (const ev of early.splice(0)) handler(ev);
    worker.onmessage = handler;
  });
}

void import('./main').then(() => {
  if (!withStart) loadFirst();
});
// "?timing" in the link: a box with the first load's and the taps' timings, for checks on a
// phone (roadmap 0.13.0); its code loads only then. (Read here: the app rewrites the link.)
if (new URLSearchParams(location.search).has('timing')) void import('./timing');
