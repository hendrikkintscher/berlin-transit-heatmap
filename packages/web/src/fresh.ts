// The fresh-start page (fresh/index.html, roadmap 0.13.7): opens the app as on a new device.
// It removes the app's service worker, its caches and what it stored on the device, then
// opens the app. Favourite places and recent searches live only on the device: when there
// are any, the page asks once whether to keep them; nothing is deleted before that tap.
// Its own small entry, so the app's start page loads exactly as before.

declare const __REGION_ID__: string;

/** Settings the app keeps on the device (STATE_KEYS in early.ts, plus the language). */
export const SETTING_KEYS = ['heat-opacity', 'walk-kmh', 'step-free', 'travel', 'lang'];
/** Lists only this device has; regionKey() prefixes them, older copies are unprefixed. */
export const PERSONAL = ['favourites', 'recentPlaces'];
/** The service worker's caches (sw.js: shell-vN, data-vN, map-vN). */
export const isAppCache = (name: string) => /^(shell|data|map)-v\d+$/.test(name);

export const isPersonal = (key: string, regionId: string) =>
  PERSONAL.some((p) => key === p || key === `${regionId}:${p}`);

/**
 * Whether a stored key is the app's. Other apps on the same address (github.io) keep their
 * own keys, so only these go.
 */
export const isAppKey = (key: string, regionId: string) =>
  SETTING_KEYS.includes(key) ||
  key.startsWith('seen-') ||
  key.startsWith(`${regionId}:`) ||
  isPersonal(key, regionId);

/** The keys to remove, keeping favourites and recent searches if asked to. */
export const keysToRemove = (keys: string[], regionId: string, keepPersonal: boolean) =>
  keys.filter((k) => isAppKey(k, regionId) && !(keepPersonal && isPersonal(k, regionId)));

/** How many favourite places and recent searches are stored (the region's lists). */
export function countPersonal(storage: Pick<Storage, 'getItem'>, regionId: string) {
  const count = (name: string) => {
    try {
      const raw = storage.getItem(`${regionId}:${name}`) ?? storage.getItem(name);
      const list = JSON.parse(raw ?? '[]') as unknown;
      return Array.isArray(list) ? list.length : 0;
    } catch {
      return 0;
    }
  };
  return { favourites: count('favourites'), recent: count('recentPlaces') };
}

/** The app's address with the link's own parameters (a fresh link may carry a start). */
export const appUrl = (href: string) => {
  const here = new URL(href);
  const app = new URL('../', here);
  app.search = here.search;
  app.hash = here.hash;
  return app.href;
};

/** Removes the service worker, its caches and the stored keys; each part may be blocked. */
export async function wipe(keepPersonal: boolean, appBase: string, regionId = __REGION_ID__) {
  const jobs: Promise<unknown>[] = [];
  if ('serviceWorker' in navigator)
    jobs.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) =>
          Promise.all(regs.filter((r) => r.scope.startsWith(appBase)).map((r) => r.unregister())),
        ),
    );
  if ('caches' in self)
    jobs.push(
      caches
        .keys()
        .then((names) => Promise.all(names.filter(isAppCache).map((n) => caches.delete(n)))),
    );
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
    for (const k of keysToRemove(keys, regionId, keepPersonal)) localStorage.removeItem(k);
  } catch {
    // Storage blocked: nothing stored.
  }
  await Promise.allSettled(jobs);
}

const TEXT = {
  de: {
    title: 'Neu starten',
    intro:
      'Das öffnet Wohin jetzt? wie auf einem neuen Gerät: Die gespeicherte App, Fahrpläne, Karten und Einstellungen auf diesem Gerät werden gelöscht.',
    personal:
      'Nur auf diesem Gerät gespeichert: {list}. Sollen sie bleiben oder auch gelöscht werden?',
    favourites: '{n}\u00a0Lieblingsorte',
    favourite: '1\u00a0Lieblingsort',
    recent: '{n}\u00a0letzten Suchen',
    recentOne: '1\u00a0letzte Suche',
    and: ' und ',
    keep: 'Behalten und neu starten',
    all: 'Alles löschen und neu starten',
    cancel: 'Abbrechen',
    working: 'Wird neu gestartet …',
  },
  en: {
    title: 'Fresh start',
    intro:
      'This opens Wohin jetzt? as on a new device: the stored app, timetables, maps and settings on this device are deleted.',
    personal: 'Stored only on this device: {list}. Keep them or delete them too?',
    favourites: '{n}\u00a0favourite places',
    favourite: '1\u00a0favourite place',
    recent: '{n}\u00a0recent searches',
    recentOne: '1\u00a0recent search',
    and: ' and ',
    keep: 'Keep them and start fresh',
    all: 'Delete everything and start fresh',
    cancel: 'Cancel',
    working: 'Starting fresh …',
  },
};
type Lang = keyof typeof TEXT;

/** The app's rule (initialLang in i18n.ts): ?lang=, then the saved choice, then German. */
function pageLang(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('lang');
  } catch {
    // Storage blocked.
  }
  const l = fromUrl ?? stored;
  return l === 'en' ? 'en' : 'de';
}

function run() {
  const lang = pageLang();
  const tx = TEXT[lang];
  const $ = (id: string) => document.getElementById(id)!;
  document.documentElement.lang = lang;
  document.title = `${tx.title} · Wohin jetzt?`;
  $('title').textContent = tx.title;
  $('intro').textContent = tx.intro;
  $('working').textContent = tx.working;

  const target = appUrl(location.href);
  const appBase = new URL('../', location.href).href;
  const go = async (keepPersonal: boolean) => {
    $('choice').hidden = true;
    $('working').hidden = false;
    await wipe(keepPersonal, appBase);
    location.replace(target);
  };

  let counts = { favourites: 0, recent: 0 };
  try {
    counts = countPersonal(localStorage, __REGION_ID__);
  } catch {
    // Storage blocked: nothing kept on the device.
  }
  // Nothing of the person's own on the device: nothing to ask, start fresh at once.
  if (!counts.favourites && !counts.recent) return void go(false);

  const parts = [
    counts.favourites === 1
      ? tx.favourite
      : counts.favourites && tx.favourites.replace('{n}', String(counts.favourites)),
    counts.recent === 1
      ? tx.recentOne
      : counts.recent && tx.recent.replace('{n}', String(counts.recent)),
  ].filter(Boolean);
  $('personal').textContent = tx.personal.replace('{list}', parts.join(tx.and));
  $('keep').textContent = tx.keep;
  $('all').textContent = tx.all;
  const cancel = $('cancel') as HTMLAnchorElement;
  cancel.textContent = tx.cancel;
  cancel.href = target;
  $('keep').addEventListener('click', () => void go(true), { once: true });
  $('all').addEventListener('click', () => void go(false), { once: true });
  $('working').hidden = true;
  $('choice').hidden = false;
}

if (typeof document !== 'undefined' && document.getElementById('fresh')) run();
