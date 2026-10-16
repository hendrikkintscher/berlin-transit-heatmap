// The start page's inline script (vite.config.ts builds it into index.html, so keep it
// small): starts the routing worker before the app's code has loaded and hands it the link
// and the device's settings, so it draws the first map before the app asks for it (see
// mapAhead in worker.ts). With a start in the link it also asks for that map's timetable
// at once. boot.ts takes the worker over.
import { dataPublished, dataUrl, pageDataVersions, setDataVersions } from './data-url';
import { earlyLoad, linkHasStart, STATE_KEYS } from './early';
import type { FromWorker, ToWorker } from './protocol';
import { dataBase } from './region';

/** The worker's file, filled in by the build. */
declare const __WORKER_URL__: string;

try {
  const at = Date.now();
  const early: MessageEvent<FromWorker>[] = [];
  const stored: Record<string, string | null> = {};
  try {
    for (const key of STATE_KEYS) stored[key] = localStorage.getItem(key);
  } catch {
    // Storage blocked: the defaults.
  }
  const worker = new Worker(__WORKER_URL__, { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => early.push(e);
  const send = (m: ToWorker) => worker.postMessage(m);
  const v = pageDataVersions();
  send({ type: 'boot', v, baseURI: document.baseURI, search: location.search, stored, at });
  window.__boot = { worker, early };
  if (linkHasStart(location.search)) {
    // The first map's timetable and the stop list, at high priority: browsers fetch the
    // worker's own script last, and the worker's requests for the files (once that is in)
    // are answered from these downloads. (Read here too, so they run on.)
    setDataVersions(v);
    const { window } = earlyLoad(location.search, {
      stepFree: stored['step-free'] ?? null,
      travel: stored.travel ?? null,
    });
    const files = [`timetable-${window}.bin`];
    // Its stops and footpaths, loaded once for every hour (0.13.13).
    if (dataPublished('stoplist.bin')) files.push('stoplist.bin');
    for (const name of files)
      fetch(dataUrl(dataBase(), name), { priority: 'high' })
        .then((res) => res.arrayBuffer())
        .catch(() => {});
  }
} catch {
  // No module workers: the entry starts the worker as before.
}
