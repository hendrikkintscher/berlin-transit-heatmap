// The app's entry: starts the routing worker and the hour's timetable download straight
// away, then loads the rest of the app (most of it the map library) next to them.
// main.ts takes the worker over.
// Styles come with the entry, so the page never shows unstyled while main.ts loads.
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { FromWorker, ToWorker } from './protocol';
import { computeWindow, whenAt, whenFromParams } from './when';

export const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
export const send = (m: ToWorker) => worker.postMessage(m);

send({ type: 'init', dataBase: new URL('data/', document.baseURI).href });
const params = new URLSearchParams(location.search);
send({
  type: 'load',
  // The same hour the app will ask for (see readUrl in main.ts).
  window: computeWindow(
    whenFromParams(params, whenAt(new Date())),
    params.get('dir') === 'arr' ? 'arrive' : 'depart',
  ),
});

/** Messages that arrive before the app listens, handed over by listen(). */
const early: MessageEvent<FromWorker>[] = [];
worker.onmessage = (ev: MessageEvent<FromWorker>) => early.push(ev);

/** Hands the worker's messages to `handler`, the early ones first, once main.ts has run. */
export function listen(handler: (ev: MessageEvent<FromWorker>) => void): void {
  setTimeout(() => {
    for (const ev of early.splice(0)) handler(ev);
    worker.onmessage = handler;
  });
}

void import('./main');
