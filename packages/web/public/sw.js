// Service worker: offline app shell, cached timetable files and the basemap.
// Bump VERSION to drop old caches after a breaking change.
const VERSION = 'v2';
// Hourly timetables are 0.5–0.7 MB gzipped each: keep the 12 most recently used ones
// (a few hours of a few days, about 8 MB). The other data files are few and always kept.
const MAX_TIMETABLES = 12;
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
// The basemap from OpenFreeMap (free, no usage limits, CORS): style, sprites and fonts,
// and the most recently used vector tiles (a few hundred are a few MB, a city's worth).
const MAP = 'map-v1';
const MAP_HOST = 'tiles.openfreemap.org';
const MAX_TILES = 400;
// Listing the tile cache costs time: trim it once every so many stored tiles.
const TRIM_EVERY = 50;
let tilePuts = 0;
// Waiting longer than this for the start page serves the cached one (refreshed behind it).
const NAV_TIMEOUT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icons/icon.svg'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => ![SHELL, DATA, MAP].includes(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.host === MAP_HOST) return event.respondWith(mapResponse(event, req, url));
  if (url.origin !== self.location.origin) return;

  // Other pages (the fresh-start page, fresh/) go to the network: storing one as './' would
  // open it in place of the app.
  if (req.mode === 'navigate' && !isStartPage(url, self.location.href)) return;
  if (req.mode === 'navigate') {
    // Network first so new deploys show up, but a slow network doesn't hang the start:
    // after NAV_TIMEOUT_MS (or offline) the cached shell, while the fetch still refreshes it.
    const fresh = fetch(req);
    event.waitUntil(
      fresh
        .then(async (res) => {
          if (!res.ok) return;
          const copy = res.clone();
          const html = await res.clone().text();
          const c = await caches.open(SHELL);
          await c.put('./', copy);
          // Old app versions' bundles go once the new page is stored.
          await pruneAssets(c, html);
        })
        .catch(() => {}),
    );
    event.respondWith(
      new Promise((resolve) => {
        let done = false;
        const cached = () =>
          caches.match('./').then((hit) => {
            if (hit && !done) {
              done = true;
              resolve(hit);
            }
            return hit;
          });
        const timer = setTimeout(cached, NAV_TIMEOUT_MS);
        fresh.then(
          (res) => {
            clearTimeout(timer);
            if (!done) {
              done = true;
              resolve(res);
            }
          },
          async () => {
            clearTimeout(timer);
            if (!(await cached()) && !done) resolve(Response.error());
          },
        );
      }),
    );
  } else if (url.pathname.includes('/data/')) {
    event.respondWith(
      url.searchParams.has('v') ? versionedData(event, req, url) : refreshedData(event, req),
    );
  } else {
    // Hashed build assets and icons never change under the same URL.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

/** Whether a page address is the app's start page ('./' or './index.html' next to sw.js). */
function isStartPage(url, swUrl) {
  const root = new URL('./', swUrl).pathname;
  return url.pathname === root || url.pathname === `${root}index.html`;
}

/**
 * A data file named with its version (`walk.bin?v=1a2b3c4d`, see data-url.ts): the same
 * address always has the same content, so a cached copy is used without asking the network.
 * Storing a new version drops the old ones; offline, an older copy stands in.
 */
async function versionedData(event, req, url) {
  const c = await caches.open(DATA);
  const hit = await c.match(req);
  if (hit) return hit;
  let res;
  try {
    res = await fetch(req);
  } catch (err) {
    const older = await c.match(req, { ignoreSearch: true });
    if (older) return older;
    throw err;
  }
  if (res.ok) {
    const copy = res.clone();
    event.waitUntil(
      c.put(req, copy).then(async () => {
        const old = (await c.keys()).filter(
          (k) => k.url !== req.url && new URL(k.url).pathname === url.pathname,
        );
        await Promise.all(old.map((k) => c.delete(k)));
        await trim(c);
      }),
    );
  }
  return res;
}

/**
 * A data file without a version (an app from before versions, or a local run): the cached
 * copy at once, refreshed in the background.
 */
async function refreshedData(event, req) {
  const c = await caches.open(DATA);
  const cached = await c.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok) c.put(req, res.clone()).then(() => trim(c));
    return res;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

/** A cached timetable's date (YYYYMMDD) or null for a typical day. */
const dateOf = (url) => /timetable-(\d{8})-\d\d\./.exec(url)?.[1] ?? null;

/** Today in Berlin as YYYYMMDD. */
function today() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return get('year') + get('month') + get('day');
}

async function trim(cache) {
  // Cache keys come back in insertion order; re-putting a file on refresh moves it to the end.
  const timetables = (await cache.keys()).filter((k) => /\/timetable-[^/]+$/.test(k.url));
  // Past days are never shown again: they go first, then the least recently used.
  const now = today();
  const past = timetables.filter((k) => (dateOf(k.url) ?? now) < now);
  const rest = timetables.filter((k) => !past.includes(k));
  const drop = [...past, ...rest.slice(0, Math.max(0, rest.length - MAX_TIMETABLES))];
  await Promise.all(drop.map((k) => cache.delete(k)));
}

/**
 * The basemap: sprites, fonts and the tiles of a dated tile set (".../20261004_113936_pt/")
 * never change under their URL (cache first); the style and the tile index are served from
 * the cache at once and refreshed behind it.
 */
async function mapResponse(event, req, url) {
  const c = await caches.open(MAP);
  const cached = await c.match(req);
  const immutable = /\/(sprites|fonts)\/|\/\d{8}_\d{6}_\w+\//.test(url.pathname);
  if (cached && immutable) return cached;
  const fresh = fetch(req).then((res) => {
    if (res.ok) c.put(req, res.clone()).then(() => ++tilePuts % TRIM_EVERY || trimTiles(c));
    return res;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

/** Keeps the MAX_TILES most recently used tiles (style, sprites and fonts always stay). */
async function trimTiles(cache) {
  const tiles = (await cache.keys()).filter((k) => /\/\d+\/\d+\/\d+\.(pbf|png)$/.test(k.url));
  await Promise.all(
    tiles.slice(0, Math.max(0, tiles.length - MAX_TILES)).map((k) => cache.delete(k)),
  );
}

/** Hashed bundle names a page or bundle refers to ("main-Bz2Qz9WU.js"). */
const assetNames = (text) => new Set(text.match(/[\w-]+-[\w-]{8}\.(?:js|css)\b/g) ?? []);

/**
 * Deletes cached /assets/ files the current page no longer uses: everything not named by
 * the page or, in turn, by a bundle it uses (the boot script names main and the worker).
 * Each deploy otherwise left its 1.1 MB app behind on the phone.
 */
async function pruneAssets(cache, html) {
  const keep = assetNames(html);
  if (!keep.size) return;
  const assets = (await cache.keys()).filter((k) => /\/assets\//.test(k.url));
  const name = (k) => k.url.split('/').pop();
  const read = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const k of assets) {
      if (!keep.has(name(k)) || !/\.js$/.test(k.url) || read.has(k.url)) continue;
      read.add(k.url);
      const res = await cache.match(k);
      for (const n of assetNames(res ? await res.text() : ''))
        if (!keep.has(n)) {
          keep.add(n);
          grew = true;
        }
    }
  }
  await Promise.all(assets.filter((k) => !keep.has(name(k))).map((k) => cache.delete(k)));
}
