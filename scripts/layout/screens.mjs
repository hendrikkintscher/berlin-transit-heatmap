// Layout check (S021): screenshots of the main screens at several sizes and in both languages,
// with a list of what overlaps, is cut off, sits outside the screen or is too small to tap.
//
//   node scripts/layout/screens.mjs --dist packages/web/dist --out <dir> \
//     [--data <cache dir for /data/berlin/*>] [--sizes 360x740,390x844] [--langs de,en] [--blank]
//
// Serves the dist on localhost; /data/<region>/* comes from --data, filled from the live site on
// a miss. The real basemap is used unless --blank (then MapLibre gets a blank style). Writes
// <out>/<size>-<lang>-<screen>.png and <out>/report.json; prints the findings.
// Only Chromium is installed in the cloud container: Safari and Firefox are approximated by their
// user agents and touch settings, and their CSS support is checked separately (see the PR of S021).
/* global window, document, getComputedStyle */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const { values: opt } = parseArgs({
  options: {
    dist: { type: 'string', default: 'packages/web/dist' },
    data: { type: 'string', default: 'packages/routing/.data/live' },
    out: { type: 'string', default: 'layout-shots' },
    sizes: { type: 'string', default: '360x740,390x844,430x932,820x1180,1280x800' },
    langs: { type: 'string', default: 'de,en' },
    screens: { type: 'string', default: '' },
    blank: { type: 'boolean', default: false },
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
  mkdirSync(data, { recursive: true });
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const m = /^\/data\/[\w-]+\/([\w.-]+)$/.exec(path);
    const file = m ? join(data, m[1]) : join(dist, path);
    if (m && !existsSync(file)) {
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

const START = 'from=52.52190,13.41320';
/** Each screen: the link to open and what to do before the picture. */
const SCREENS = {
  first: { query: '' },
  map: { query: START },
  trip: { query: START, tap: true },
  drawer: { query: START, tap: true, drawer: true },
  zeit: { query: START, click: '#when-btn' },
  search: { query: '', click: '#hint-search', type: 'Alexanderpl' },
  menu: { query: START, click: '#menu-btn' },
  treffpunkt: { query: `${START}&with=52.50700,13.33200` },
};

/** What looks broken on the page: outside the screen, cut-off text, small targets, overlaps. */
function findings() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const out = [];
  const name = (el) =>
    el.id
      ? `#${el.id}`
      : `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
  const shown = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[hidden], .maplibregl-canvas-container');
  };
  const ui = [...document.querySelectorAll('body *')].filter(
    (el) => !el.closest('#map') || el.closest('.maplibregl-ctrl, .maplibregl-marker'),
  );
  for (const el of ui) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    // Outside the screen sideways (the map itself is edge to edge).
    if (r.left < -1 || r.right > W + 1)
      if (!el.closest('[style*="transform"], .scroll-x, #chips'))
        out.push({
          kind: 'outside',
          el: name(el),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
    // Text cut off: overflowing its own box with no scrolling.
    const s = getComputedStyle(el);
    if (
      el.children.length === 0 &&
      el.textContent.trim() &&
      el.scrollWidth > el.clientWidth + 1 &&
      s.overflowX !== 'auto' &&
      s.overflowX !== 'scroll' &&
      s.textOverflow !== 'ellipsis'
    )
      out.push({ kind: 'cut', el: name(el), text: el.textContent.trim().slice(0, 40) });
    // Touch targets under 44 px.
    if (el.matches('button, a[href], [role="button"], input, select, summary') && r.top < H) {
      if (r.width < 44 || r.height < 44)
        out.push({ kind: 'small', el: name(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  // Overlapping floating controls (buttons over buttons).
  const btns = ui.filter((el) => el.matches('button') && shown(el));
  for (let i = 0; i < btns.length; i++)
    for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].getBoundingClientRect();
      const b = btns[j].getBoundingClientRect();
      if (btns[i].contains(btns[j]) || btns[j].contains(btns[i])) continue;
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 4 && y > 4) out.push({ kind: 'overlap', el: name(btns[i]), with: name(btns[j]) });
    }
  return out;
}

const server = await serve(resolve(opt.dist), resolve(opt.data));
const base = `http://127.0.0.1:${server.address().port}/`;
const exe =
  process.env.CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--ignore-gpu-blocklist',
    '--enable-gpu-compositing',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
mkdirSync(opt.out, { recursive: true });
const report = {};
const only = opt.screens ? opt.screens.split(',') : Object.keys(SCREENS);
for (const size of opt.sizes.split(',')) {
  const [width, height] = size.split('x').map(Number);
  const phone = width < 600;
  for (const lang of opt.langs.split(',')) {
    for (const key of only) {
      const sc = SCREENS[key];
      const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        isMobile: phone,
        hasTouch: width < 1000,
        serviceWorkers: 'block',
        locale: lang === 'de' ? 'de-DE' : 'en-GB',
      });
      if (opt.blank)
        await ctx.route(
          (u) => !u.href.startsWith(base),
          (r) =>
            r.request().url().includes('/styles/')
              ? r.fulfill({
                  json: {
                    version: 8,
                    sources: {},
                    layers: [
                      { id: 'bg', type: 'background', paint: { 'background-color': '#eee' } },
                    ],
                  },
                })
              : r.abort(),
        );
      else
        await ctx.route(
          (u) => !u.href.startsWith(base) && !/openfreemap|photon\.komoot/.test(u.host),
          (r) => r.abort(),
        );
      await ctx.addInitScript(() => {
        const W = window.Worker;
        window.__results = 0;
        window.Worker = class extends W {
          constructor(...a) {
            super(...a);
            this.addEventListener('message', (e) => {
              if (e.data?.type === 'result') window.__results++;
            });
          }
        };
      });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(String(e)));
      const q = [sc.query, `lang=${lang}`].filter(Boolean).join('&');
      await p.goto(`${base}?${q}`);
      try {
        if (sc.query) await p.waitForFunction(() => window.__results > 0, null, { timeout: 60000 });
        await p.waitForTimeout(sc.query ? 2500 : 1500);
        if (sc.tap) {
          const box = await p.locator('.origin-marker').first().boundingBox();
          await p.mouse.click(
            box.x + box.width / 2 + width * 0.18,
            box.y + box.height / 2 - height * 0.12,
          );
          await p.waitForSelector('#trip .trip-leave', { timeout: 30000 });
          await p.waitForTimeout(1200);
        }
        if (sc.drawer) {
          await p.click('#readout-grip');
          await p.waitForTimeout(2500);
        }
        if (sc.click) {
          await p.click(sc.click);
          await p.waitForTimeout(800);
        }
        if (sc.type) {
          await p.keyboard.type(sc.type, { delay: 40 });
          await p.waitForTimeout(2500);
        }
      } catch (e) {
        errors.push(`flow: ${String(e).split('\n')[0]}`);
      }
      const file = `${size}-${lang}-${key}.png`;
      await p.screenshot({ path: join(opt.out, file) });
      const f = await p.evaluate(findings);
      report[file] = { findings: f, errors };
      const tally =
        f.length || errors.length
          ? `${f.length} findings${errors.length ? `, errors: ${errors.join(' | ')}` : ''}`
          : 'ok';
      console.log(`${file}: ${tally}`);
      await ctx.close();
    }
  }
}
writeFileSync(join(opt.out, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
server.close();
