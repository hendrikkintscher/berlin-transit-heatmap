// The timing box ("?timing" in the link, roadmap 0.13.0): how long the first map, the base
// map, the footpaths (0.13.1) and each tap's trip took on this device, and whether the first
// timetable and the stop list came down once or twice (the start page and the worker both
// ask for them). Loaded only with the link key, so it costs nothing otherwise. Times in ms
// since the page opened.
import { send, worker } from './boot';
import type { Download, FromWorker } from './protocol';

const box = document.createElement('pre');
box.id = 'timing';
box.style.cssText =
  'position:fixed;left:8px;top:96px;z-index:50;margin:0;padding:6px 8px;max-width:calc(100vw - 32px);' +
  'background:rgba(255,255,255,.92);color:#111;font:11px/1.35 ui-monospace,monospace;' +
  'border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.3);pointer-events:none;white-space:pre-wrap';
document.body.append(box);

const ms = (x: number | undefined) => (x === undefined ? '…' : `${Math.round(x)}`);
const mark = (name: string) => performance.getEntriesByName(name, 'mark')[0]?.startTime;
const file = (url: string) => /timetable-[\w-]+\.bin|stoplist\.bin/.exec(url)?.[0];
const STOP_LIST = 'stoplist.bin';

/** The worker's timetable downloads, in the page's time. */
let workerDownloads: Download[] = [];
worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
  if (e.data.type !== 'downloads') return;
  workerDownloads = e.data.list.map((d) => ({
    ...d,
    start: d.start - performance.timeOrigin,
    end: d.end - performance.timeOrigin,
  }));
});

function downloads(): string[] {
  const page = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((e) => file(e.name))
    .map((e) => ({
      by: 'page',
      name: e.name,
      start: e.startTime,
      end: e.responseEnd,
      bytes: e.transferSize,
    }));
  const all = [
    ...page,
    ...workerDownloads.filter((d) => file(d.name)).map((d) => ({ by: 'worker', ...d })),
  ];
  const first = all.map((d) => file(d.name)).find((f) => f !== STOP_LIST);
  const lines = (name: string | undefined, title: string) => {
    const list = all
      .filter((d) => file(d.name) === name)
      .map((d) => `  ${d.by}: ${ms(d.start)}–${ms(d.end)}, ${Math.round(d.bytes / 1024)} KB`);
    return list.length ? [title, ...list] : [];
  };
  return [...lines(first, `timetable ${first}`), ...lines(STOP_LIST, 'stop list')];
}

/** Each tap and how long until its trip was on the card. */
function taps(): string[] {
  const marks = performance.getEntriesByType('mark');
  const out: string[] = [];
  marks.forEach((m, i) => {
    if (m.name !== 'tap') return;
    const trip = marks.slice(i + 1).find((n) => n.name === 'trip' || n.name === 'tap');
    out.push(
      `tap @${ms(m.startTime)}: trip ${trip?.name === 'trip' ? ms(trip.startTime - m.startTime) : '…'}`,
    );
  });
  return out.slice(-8);
}

function render() {
  send({ type: 'downloads' });
  box.textContent = [
    `first map ${ms(mark('first-map'))}`,
    `base map ${ms(mark('basemap-loaded'))}`,
    `footpaths ${ms(mark('footpaths'))}`,
    ...downloads(),
    ...taps(),
  ].join('\n');
}
render();
setInterval(render, 500);
