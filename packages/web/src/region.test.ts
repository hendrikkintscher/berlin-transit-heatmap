import { describe, expect, it } from 'vitest';
import { region, regionKey } from './region';

/** A Map-backed Storage. */
function memory(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('regionKey', () => {
  it('keeps lists per region', () => {
    expect(region.id).toBe('berlin');
    expect(regionKey('favourites', memory())).toBe('berlin:favourites');
  });
  it("moves Berlin's lists from before regions over, once", () => {
    const s = memory({ favourites: '[{"label":"Home"}]' });
    regionKey('favourites', s);
    expect(s.getItem('berlin:favourites')).toBe('[{"label":"Home"}]');
    s.setItem('berlin:favourites', '[]');
    regionKey('favourites', s);
    expect(s.getItem('berlin:favourites')).toBe('[]');
  });
});
