import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { addDays } from './when';

// sw.js is a plain script: run it in a sandbox and call its trim() on a fake cache.
function load() {
  const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const sandbox = { self: { addEventListener() {} }, Intl, Date, Promise } as Record<
    string,
    unknown
  >;
  vm.createContext(sandbox);
  vm.runInContext(
    `${src}\nthis.trim = trim; this.today = today; this.pruneAssets = pruneAssets; this.trimTiles = trimTiles;`,
    sandbox,
  );
  return sandbox as unknown as {
    trim: (cache: unknown) => Promise<void>;
    today: () => string;
    pruneAssets: (cache: unknown, html: string) => Promise<void>;
    trimTiles: (cache: unknown) => Promise<void>;
  };
}

describe('offline timetable cache', () => {
  it('drops past days first, then keeps the 12 most recently used timetables', async () => {
    const sw = load();
    const today = sw.today();
    const names = [
      'walk.bin',
      'lines.bin',
      `timetable-${addDays(today, -1)}-10.bin`,
      ...Array.from(
        { length: 13 },
        (_, h) => `timetable-weekday-${String(h).padStart(2, '0')}.bin`,
      ),
      `timetable-${today}-10.bin`,
    ];
    let keys = names.map((n) => ({ url: `https://x/data/${n}` }));
    await sw.trim({
      keys: async () => keys,
      delete: async (k: unknown) => {
        keys = keys.filter((x) => x !== k);
      },
    });
    const left = keys.map((k) => k.url.split('/').pop());
    expect(left).toEqual([
      'walk.bin',
      'lines.bin',
      ...Array.from(
        { length: 11 },
        (_, h) => `timetable-weekday-${String(h + 2).padStart(2, '0')}.bin`,
      ),
      `timetable-${today}-10.bin`,
    ]);
  });
});

/** A fake Cache holding `files` (url -> text). */
function fakeCache(files: Record<string, string>) {
  let keys = Object.keys(files).map((url) => ({ url }));
  return {
    left: () => keys.map((k) => k.url.split('/').pop()),
    keys: async () => keys,
    match: async (k: { url: string }) => ({ text: async () => files[k.url] ?? '' }),
    delete: async (k: unknown) => {
      keys = keys.filter((x) => x !== k);
    },
  };
}

describe('offline app cache', () => {
  it('keeps the bundles the page uses, directly or through another bundle, and drops old ones', async () => {
    const a = 'https://x/app/assets/';
    const cache = fakeCache({
      'https://x/app/': '',
      [`${a}index-NEWNEW01.js`]: 'import("./main-NEWNEW02.js"); new URL("worker-NEWNEW03.js")',
      [`${a}main-NEWNEW02.js`]: 'main',
      [`${a}worker-NEWNEW03.js`]: 'worker',
      [`${a}index-NEWNEW04.css`]: '',
      [`${a}index-OLDOLD01.js`]: 'import("./main-OLDOLD02.js")',
      [`${a}main-OLDOLD02.js`]: 'old main',
    });
    await load().pruneAssets(
      cache,
      '<script src="./assets/index-NEWNEW01.js"></script><link href="./assets/index-NEWNEW04.css">',
    );
    expect(cache.left()).toEqual([
      '',
      'index-NEWNEW01.js',
      'main-NEWNEW02.js',
      'worker-NEWNEW03.js',
      'index-NEWNEW04.css',
    ]);
  });

  it('leaves the cache alone for a page that names no bundles', async () => {
    const cache = fakeCache({ 'https://x/assets/main-OLDOLD02.js': '' });
    await load().pruneAssets(cache, '<html>Offline</html>');
    expect(cache.left()).toEqual(['main-OLDOLD02.js']);
  });

  it('keeps the 400 most recent map tiles and always the style, sprites and fonts', async () => {
    const t = 'https://tiles.openfreemap.org/planet/v/';
    const cache = fakeCache({
      'https://tiles.openfreemap.org/styles/positron': '',
      'https://tiles.openfreemap.org/fonts/Noto/0-255.pbf': '',
      ...Object.fromEntries(Array.from({ length: 405 }, (_, i) => [`${t}14/${i}/5.pbf`, ''])),
    });
    await load().trimTiles(cache);
    const left = cache.left();
    expect(left).toHaveLength(402);
    expect(left.slice(0, 3)).toEqual(['positron', '0-255.pbf', '5.pbf']);
    expect(left.filter((n) => n === '5.pbf')).toHaveLength(400);
  });
});

describe('versioned data files', () => {
  // A cache of url -> body, and a network that answers from `net` (or is offline).
  function setup(stored: string[], net: Record<string, string> | null) {
    const entries = stored.map((url) => ({ url, body: 'old' }));
    const cache = {
      match: async (req: { url: string }, opts?: { ignoreSearch?: boolean }) => {
        const strip = (u: string) => (opts?.ignoreSearch ? u.split('?')[0] : u);
        const hit = entries.find((e) => strip(e.url) === strip(req.url));
        return hit && { ok: true, body: hit.body };
      },
      put: async (req: { url: string }, res: { body: string }) => {
        entries.push({ url: req.url, body: res.body });
      },
      keys: async () => entries.map((e) => ({ url: e.url })),
      delete: async (k: { url: string }) => {
        entries.splice(
          entries.findIndex((e) => e.url === k.url),
          1,
        );
      },
    };
    let fetched = 0;
    const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
    const sandbox = {
      self: { addEventListener() {} },
      Intl,
      Date,
      Promise,
      URL,
      caches: { open: async () => cache },
      fetch: async (req: { url: string }) => {
        fetched++;
        if (!net) throw new TypeError('offline');
        const body = net[req.url];
        const res = { ok: body !== undefined, body, clone: () => res };
        return res;
      },
    } as Record<string, unknown>;
    vm.createContext(sandbox);
    vm.runInContext(`${src}\nthis.versionedData = versionedData;`, sandbox);
    const waits: Promise<unknown>[] = [];
    const get = async (url: string) => {
      const res = await (
        sandbox.versionedData as (e: unknown, r: unknown, u: URL) => Promise<{ body: string }>
      )({ waitUntil: (p: Promise<unknown>) => waits.push(p) }, { url }, new URL(url));
      await Promise.all(waits);
      return res.body;
    };
    return { get, urls: () => entries.map((e) => e.url), fetched: () => fetched };
  }
  const walk = 'https://x/data/berlin/walk.bin';

  it('uses the stored copy of the same version without the network', async () => {
    const s = setup([`${walk}?v=aaaa`], {});
    expect(await s.get(`${walk}?v=aaaa`)).toBe('old');
    expect(s.fetched()).toBe(0);
  });

  it('fetches a new version once and drops the old one', async () => {
    const s = setup([`${walk}?v=aaaa`, 'https://x/data/berlin/lines.bin?v=cccc'], {
      [`${walk}?v=bbbb`]: 'new',
    });
    expect(await s.get(`${walk}?v=bbbb`)).toBe('new');
    expect(s.urls()).toEqual(['https://x/data/berlin/lines.bin?v=cccc', `${walk}?v=bbbb`]);
  });

  it('offline, an older version stands in', async () => {
    const s = setup([`${walk}?v=aaaa`], null);
    expect(await s.get(`${walk}?v=bbbb`)).toBe('old');
  });
});
