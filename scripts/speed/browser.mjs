// Browser timings at phone size, as CLAUDE.md "Speed comes first" asks for: fresh visits at
// 360x740, first map (the worker's first 'result'), tap to trip on the card and the map redone
// once the footpaths are in (from the worker's 'walk' to its next 'result'), medians.
//
//   node scripts/speed/browser.mjs --dist packages/web/dist --data packages/routing/.data \
//     [--base <other dist, e.g. main's>] [--visits 7] [--cpu 4] [--query "bis=30"]
//   node scripts/speed/browser.mjs --url https://hendrikkintscher.github.io/berlin-transit-heatmap/
//
// Serves each dist on localhost with /data/<region>/* from --data (a file missing there is
// fetched from the live site and kept, unless --no-fetch), blocks every other host and
// gives MapLibre a blank style, so only the app's own work is timed. --cpu slows the page
// (Chrome cannot slow the worker). Chromium: $CHROMIUM, else the cloud container's
// /opt/pw-browsers/chromium, else the installed Chrome (Windows/macOS). The GPU flags avoid the
// ~75 ms per-frame copy of plain headless Chromium that delays every worker answer (decision 0008).
/* global window */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const { values: opt } = parseArgs({
  options: {
    dist: { type: 'string', default: 'packages/web/dist' },
    base: { type: 'string' },
    data: { type: 'string', default: 'packages/routing/.data' },
    visits: { type: 'string', default: '7' },
    cpu: { type: 'string', default: '1' },
    query: { type: 'string', default: '' },
    'no-fetch': { type: 'boolean', default: false },
    // Time a deployed site instead of a local dist, e.g. the live one (S024): network included.
    url: { type: 'string' },
  },
});
const LIVE = 'https://hendrikkintscher.github.io/berlin-transit-heatmap/data/berlin/';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function serve(dist, data) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (path.startsWith('/tiles/')) return res.writeHead(200).end();
    const m = /^\/data\/[\w-]+\/([\w.-]+)$/.exec(path);
    const file = m ? join(data, m[1]) : join(dist, path);
    // A data file not in --data yet (today's hours): fetched once from the live site and kept.
    if (m && !opt['no-fetch'] && !existsSync(file)) {
      const r = await fetch(LIVE + m[1]).catch(() => null);
      if (r?.ok) writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    let body;
    try {
      body = readFileSync(file);
    } catch {
      return res.writeHead(404).end();
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function launchOptions() {
  const args = [
    '--ignore-gpu-blocklist',
    '--enable-gpu-compositing',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ];
  const path = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
  return existsSync(path) ? { executablePath: path, args } : { channel: 'chrome', args };
}

async function visit(browser, url, cpu) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const origin = new URL(url).origin;
  const blank = {
    version: 8,
    sources: { openmaptiles: { type: 'vector', tiles: [`${origin}/tiles/{z}/{x}/{y}.pbf`] } },
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }],
  };
  await ctx.route(
    (u) => u.origin !== origin,
    (r) => (r.request().url().includes('/styles/') ? r.fulfill({ json: blank }) : r.abort()),
  );
  await ctx.addInitScript(() => {
    window.__results = [];
    window.__walk = 0;
    window.__network = 0;
    const W = window.Worker;
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (e) => {
          if (e.data?.type === 'result') window.__results.push(performance.now());
          // The footpaths are in (the map is redone with them next, S041).
          if (e.data?.type === 'walk') window.__walk = performance.now();
          // The whole network as faint lines (S058).
          if (e.data?.type === 'network') window.__network = performance.now();
        });
      }
    };
  });
  const page = await ctx.newPage();
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  await page.goto(url);
  await page.waitForFunction(() => window.__results.length > 0, null, { timeout: 60000 });
  const box = await page.locator('.origin-marker').first().boundingBox();
  // A place about 2.5 km south-east of the start at the default zoom.
  await page.mouse.click(box.x + box.width / 2 + 90, box.y + box.height / 2 + 70);
  await page.waitForFunction(() => performance.getEntriesByName('trip').length > 0, null, {
    timeout: 30000,
  });
  // The map redone with the footpaths: from their arrival in the worker to its next 'result'.
  await page.waitForFunction(
    () => window.__walk > 0 && window.__results.some((x) => x > window.__walk),
    null,
    { timeout: 60000 },
  );
  // A second tap at the same moment on every build: 2.5 s after the footpath map, when the
  // network's lines (S058, about 1 s after the first map) are drawn.
  await page.waitForTimeout(2500);
  await page.mouse.click(box.x + box.width / 2 - 80, box.y + box.height / 2 - 90);
  await page.waitForFunction(() => performance.getEntriesByName('trip').length > 1, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);
  // Panning: the median and slowest frame while the map is dragged, in the city view and at
  // street level (zoom 14.3, where S058's bus lines are drawn too).
  const pan = async () => {
    const frames = page.evaluate(
      () =>
        new Promise((done) => {
          const at = [];
          const step = (now) => {
            at.push(now);
            if (at.length < 40) requestAnimationFrame(step);
            else done(at.slice(1).map((x, i) => x - at[i]));
          };
          requestAnimationFrame(step);
        }),
    );
    await page.mouse.move(180, 300);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(180 + i * 4, 300 + i * 3);
    await page.mouse.up();
    return (await frames).sort((x, y) => x - y);
  };
  const gaps = await pan();
  await page.focus('.maplibregl-canvas');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Equal');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2000);
  const street = await pan();
  const t = await page.evaluate(() => {
    const trips = performance.getEntriesByName('trip');
    const taps = performance.getEntriesByName('tap');
    return {
      firstMap: window.__results[0],
      tapTrip: trips[0].startTime - taps[0].startTime,
      footMap: window.__results.find((x) => x > window.__walk) - window.__walk,
      tap2: trips[trips.length - 1].startTime - taps[taps.length - 1].startTime,
      network: window.__network ? window.__network - window.__results[0] : NaN,
    };
  });
  t.frame = gaps[Math.floor(gaps.length / 2)];
  t.frameMax = gaps[gaps.length - 1];
  t.street = street[Math.floor(street.length / 2)];
  t.mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  t.streetMean = street.reduce((a, b) => a + b, 0) / street.length;
  t.streetMax = street[street.length - 1];
  await ctx.close();
  return t;
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const cpu = Number(opt.cpu);
const visits = Number(opt.visits);
const runs = opt.url
  ? [['url', opt.url]]
  : [...(opt.base ? [['base', opt.base]] : []), ['dist', opt.dist]];
const browser = await chromium.launch(launchOptions());
for (const [name, dist] of runs) {
  const server = opt.url ? null : await serve(resolve(dist), resolve(opt.data));
  const q = `from=52.52190,13.41320&t=weekday-10&lang=de${opt.query ? `&${opt.query}` : ''}`;
  const url = server ? `http://127.0.0.1:${server.address().port}/?${q}` : `${opt.url}?${q}`;
  const rows = [];
  for (let v = 0; v < visits; v++) rows.push(await visit(browser, url, cpu));
  server?.close();
  const r = (x) => Math.round(x);
  console.log(
    `${name} (${dist}), cpu ${cpu}x, ${visits} visits: first map ${r(median(rows.map((x) => x.firstMap)))} ms` +
      ` [${rows.map((x) => r(x.firstMap)).join(' ')}], tap to trip ${r(median(rows.map((x) => x.tapTrip)))} ms` +
      ` [${rows.map((x) => r(x.tapTrip)).join(' ')}], footpath map ${r(median(rows.map((x) => x.footMap)))} ms` +
      ` [${rows.map((x) => r(x.footMap)).join(' ')}], tap after the network ${r(median(rows.map((x) => x.tap2)))} ms` +
      ` [${rows.map((x) => r(x.tap2)).join(' ')}], pan frame ${r(median(rows.map((x) => x.frame)))} ms` +
      ` (slowest ${r(median(rows.map((x) => x.frameMax)))}), street pan frame ${r(median(rows.map((x) => x.street)))} ms` +
      ` (slowest ${r(median(rows.map((x) => x.streetMax)))}), mean pan frame ${median(rows.map((x) => x.mean)).toFixed(1)}` +
      ` / ${median(rows.map((x) => x.streetMean)).toFixed(1)} ms, network ${r(median(rows.map((x) => x.network)))} ms after the first map`,
  );
}
await browser.close();
