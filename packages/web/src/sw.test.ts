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
  vm.runInContext(`${src}\nthis.trim = trim; this.today = today;`, sandbox);
  return sandbox as unknown as {
    trim: (cache: unknown) => Promise<void>;
    today: () => string;
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
