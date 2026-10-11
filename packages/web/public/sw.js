// Service worker: offline app shell + cached timetable files.
// Bump VERSION to drop old caches after a breaking change.
const VERSION = 'v2';
// Hourly timetables are 0.5–0.7 MB gzipped each: keep only the most recently used ones.
const MAX_DATA = 6;
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;

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
        Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first so new deploys show up; cached shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
  } else if (url.pathname.includes('/data/')) {
    // Timetables change monthly: serve the cached copy instantly, refresh it in the background.
    event.respondWith(
      caches.open(DATA).then(async (c) => {
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
      }),
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

async function trim(cache) {
  // Cache keys come back in insertion order; re-putting a file on refresh moves it to the end.
  // The walking network is needed for every map, so it never counts against the limit.
  const keys = (await cache.keys()).filter((k) => !k.url.endsWith('/walk.bin'));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_DATA)).map((k) => cache.delete(k)));
}
