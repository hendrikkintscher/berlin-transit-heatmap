import { describe, expect, it } from 'vitest';
import { STATE_KEYS } from './early';
import { appUrl, countPersonal, isAppCache, keysToRemove, SETTING_KEYS } from './fresh';

const KEYS = [
  'heat-opacity',
  'walk-kmh',
  'step-free',
  'travel',
  'lang',
  'seen-tap',
  'seen-install',
  'berlin:favourites',
  'berlin:recentPlaces',
  'favourites',
  'recentPlaces',
  // Another app on the same github.io address.
  'other-app:settings',
  'theme',
];

describe('fresh start', () => {
  it('knows every setting the app starts from', () => {
    for (const k of STATE_KEYS) expect(SETTING_KEYS).toContain(k);
  });

  it("removes only the app's keys, favourites and recent searches too when asked", () => {
    expect(keysToRemove(KEYS, 'berlin', false)).toEqual(KEYS.slice(0, 11));
    expect(keysToRemove(KEYS, 'berlin', true)).toEqual(KEYS.slice(0, 7));
  });

  it("removes only the service worker's caches", () => {
    expect(['shell-v2', 'data-v2', 'map-v1', 'shell-v1', 'other-cache'].filter(isAppCache)).toEqual(
      ['shell-v2', 'data-v2', 'map-v1', 'shell-v1'],
    );
  });

  it('counts favourite places and recent searches, older unprefixed lists too', () => {
    const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });
    expect(countPersonal(store({}), 'berlin')).toEqual({ favourites: 0, recent: 0 });
    expect(
      countPersonal(store({ 'berlin:favourites': '[{},{}]', recentPlaces: '[{}]' }), 'berlin'),
    ).toEqual({ favourites: 2, recent: 1 });
    expect(countPersonal(store({ 'berlin:favourites': 'not json' }), 'berlin')).toEqual({
      favourites: 0,
      recent: 0,
    });
  });

  it("opens the app with the fresh link's own parameters", () => {
    expect(appUrl('https://h.github.io/berlin-transit-heatmap/fresh/')).toBe(
      'https://h.github.io/berlin-transit-heatmap/',
    );
    expect(appUrl('https://h.github.io/berlin-transit-heatmap/fresh/?from=52.5,13.4&lang=en')).toBe(
      'https://h.github.io/berlin-transit-heatmap/?from=52.5,13.4&lang=en',
    );
  });
});
