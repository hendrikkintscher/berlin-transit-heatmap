// Browser smoke test (roadmap B9): the built app on a phone-size screen, with a tiny
// timetable built from the mini GTFS fixture. It opens a link with a start, waits for the
// map, taps near the start and checks that the map has colours and outlines and the trip
// card shows minutes. The base map is blank with empty tiles and every other outside
// request is cut off, so the test needs no network.
//
//   node scripts/smoke/smoke.mjs [--dist packages/web/dist] [--shots <dir>]
/* global window, document, caches -- the page functions run in the browser */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: args } = parseArgs({
  options: {
    dist: { type: 'string', default: 'packages/web/dist' },
    shots: { type: 'string' },
  },
});
const dist = resolve(root, args.dist);

// ---------- fixture data ----------
const data = mkdtempSync(join(tmpdir(), 'smoke-'));
const build = spawnSync(
  process.execPath,
  [
    'packages/timetable-build/bin/build-timetable.js',
    '--gtfs',
    'packages/timetable-build/test/fixtures/mini',
    '--out',
    data,
  ],
  { cwd: root, encoding: 'utf8' },
);
if (build.status !== 0) throw new Error(`Fixture timetable failed:\n${build.stderr}`);

// ---------- server: the app, with data/berlin/ from the fixture ----------
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  // The blank base map's tiles: empty, a valid tile without features.
  if (path.startsWith('/tiles/')) return res.writeHead(200).end();
  const m = /^\/data\/[\w-]+\/(.+)$/.exec(path);
  const file = m ? join(data, m[1]) : join(dist, path);
  if (!file.startsWith(m ? data + sep : dist + sep)) return res.writeHead(403).end();
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

// ---------- browser ----------
// Playwright's own Chromium where installed, else the system Chrome (as on CI runners).
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const failures = [];
const errors = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const BLANK_STYLE = {
    version: 8,
    // The app adds a few layers on the base map's source.
    sources: { openmaptiles: { type: 'vector', tiles: [`${base}tiles/{z}/{x}/{y}.pbf`] } },
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }],
  };
  await ctx.route(
    (url) => !url.href.startsWith(base),
    (route) =>
      route.request().url().includes('/styles/')
        ? route.fulfill({ json: BLANK_STYLE })
        : route.abort(),
  );
  // Keeps the worker's last map: whether it has outlines and coloured pixels.
  await ctx.addInitScript(() => {
    const W = window.Worker;
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (e) => {
          const m = e.data;
          if (m?.type !== 'result') return;
          let coloured = 0;
          for (let i = 3; i < m.image.rgba.length; i += 4) if (m.image.rgba[i]) coloured++;
          window.__smoke = { outlines: m.outlines.features.length, coloured };
        });
      }
    };
  });
  for (const lang of ['de', 'en']) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text()))
        errors.push(`${lang}: ${m.text()}`);
    });
    const t0 = Date.now();
    await p.goto(`${base}?from=52.52000,13.40000&t=weekday-10&layers=heat&lang=${lang}`);
    await p.waitForFunction(() => window.__smoke, null, { timeout: 20000 });
    await p.waitForFunction(() => document.getElementById('loadbar').hidden, null, {
      timeout: 20000,
    });
    const mapMs = Date.now() - t0;
    const shown = await p.evaluate(() => window.__smoke);
    if (!shown.outlines) failures.push(`${lang}: the map has no outlines`);
    if (!shown.coloured) failures.push(`${lang}: the map has no colours`);
    // A tap a little north-east of the start: the trip card gives its minutes.
    const box = await p.locator('.origin-marker').first().boundingBox();
    if (!box) failures.push(`${lang}: no start marker`);
    else {
      await p.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 - 60);
      await p
        .waitForFunction(() => /\d+\s*min/i.test(document.getElementById('readout-text').innerText))
        .catch(() => {});
    }
    const card = await p.evaluate(() => document.getElementById('readout-text').innerText);
    if (!/\d+\s*min/i.test(card))
      failures.push(`${lang}: the trip card shows no minutes: "${card}"`);
    console.log(
      `${lang}: map in ${mapMs} ms, ${shown.outlines} outlines, ${shown.coloured} coloured pixels; card: ${card.replace(/\s+/g, ' ').slice(0, 80)}`,
    );
    if (args.shots) {
      mkdirSync(args.shots, { recursive: true });
      await p.screenshot({ path: join(args.shots, `smoke-${lang}.png`) });
    }
    await p.close();
  }

  // The fresh-start page (fresh/): with the app's service worker running and a favourite
  // stored, it asks once; "keep" removes the worker, its caches and the app's settings but
  // keeps the favourite and other apps' keys, then opens the app with the link's start.
  const fresh = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await fresh.route(
    (url) => !url.href.startsWith(base),
    (route) => route.abort(),
  );
  const f = await fresh.newPage();
  f.on('pageerror', (e) => errors.push(`fresh: ${e.message}`));
  await f.goto(base);
  await f.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await caches.open('data-v2');
    localStorage.setItem(
      'berlin:favourites',
      JSON.stringify([{ label: 'A', lat: 52.5, lon: 13.4, weight: 2 }]),
    );
    localStorage.setItem('seen-tap', '1');
    localStorage.setItem('walk-kmh', '5');
    localStorage.setItem('other-app', 'x');
  });
  await f.goto(`${base}fresh/?from=52.52000,13.40000`);
  await f.waitForSelector('#keep', { state: 'visible', timeout: 10000 });
  const question = await f.locator('#personal').innerText();
  if (!/: 1\s?Lieblingsort\./.test(question))
    failures.push(`fresh: unexpected question "${question}"`);
  if (args.shots) await f.screenshot({ path: join(args.shots, 'smoke-fresh.png') });
  const tFresh = Date.now();
  await f.click('#keep');
  await f.waitForURL(`${base}?from=52.52000,13.40000`, { timeout: 10000 });
  const after = await f.evaluate(async () => ({
    controlled: !!navigator.serviceWorker.controller,
    favourites: localStorage.getItem('berlin:favourites'),
    seen: localStorage.getItem('seen-tap'),
    walk: localStorage.getItem('walk-kmh'),
    other: localStorage.getItem('other-app'),
  }));
  if (after.controlled) failures.push('fresh: the app opened under the old service worker');
  if (!after.favourites) failures.push('fresh: the kept favourite is gone');
  if (after.seen || after.walk) failures.push("fresh: the app's settings are still there");
  if (after.other !== 'x') failures.push("fresh: another app's key was removed");
  console.log(
    `fresh: app reopened ${Date.now() - tFresh} ms after the tap; asked "${question.slice(0, 60)}…", ${JSON.stringify(after)}`,
  );
  await fresh.close();
} finally {
  await browser.close();
  server.close();
}
failures.push(...errors.map((e) => `page error: ${e}`));
for (const f of failures) console.error(`❌ ${f}`);
if (!failures.length) console.log('✅ Smoke test passed');
process.exit(failures.length ? 1 : 0);
