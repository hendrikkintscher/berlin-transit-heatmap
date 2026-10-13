// The start page's inline script (vite.config.ts builds it into index.html, so keep it
// small): starts the routing worker before the app's code has loaded and, with a start in
// the link, downloads the first map's timetable at once. The page asks for it at high
// priority while the worker's own script is still on its way (browsers fetch that last),
// and hands the download over (see 'prefetch' in worker.ts). boot.ts takes the worker over.
import { dataUrl, pageDataVersions, setDataVersions } from './data-url';
import { earlyLoad, linkHasStart } from './early';
import type { FromWorker, ToWorker } from './protocol';
import { dataBase } from './region';

/** The worker's file, filled in by the build. */
declare const __WORKER_URL__: string;

try {
  const early: MessageEvent<FromWorker>[] = [];
  let stepFree: string | null = null;
  let travel: string | null = null;
  try {
    stepFree = localStorage.getItem('step-free');
    travel = localStorage.getItem('travel');
  } catch {
    // Storage blocked: the defaults.
  }
  const worker = new Worker(__WORKER_URL__, { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => early.push(e);
  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  const v = pageDataVersions();
  let prefetch: string | undefined;
  if (linkHasStart(location.search)) {
    setDataVersions(v);
    const { window } = earlyLoad(location.search, { stepFree, travel });
    prefetch = dataUrl(dataBase(), `timetable-${window}.bin`).href;
  }
  send({
    type: 'boot',
    v,
    baseURI: document.baseURI,
    search: location.search,
    stepFree,
    travel,
    prefetch,
  });
  window.__boot = { worker, early };
  if (prefetch) {
    const url = prefetch;
    const failed = () => send({ type: 'prefetch', url });
    fetch(url, { priority: 'high' }).then((res) => {
      const head = {
        type: 'prefetch' as const,
        url,
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: res.headers.get('content-length'),
      };
      try {
        // The download itself, so the worker reports its progress (where streams transfer).
        send({ ...head, body: res.body! }, [res.body!]);
      } catch {
        res.arrayBuffer().then((buf) => send({ ...head, buf }, [buf]), failed);
      }
    }, failed);
  }
} catch {
  // No module workers: the entry starts the worker as before.
}
