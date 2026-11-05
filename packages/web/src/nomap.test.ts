import { describe, expect, it } from 'vitest';
import { isNoMapError, NO_MAP_TEXT, noMapLang } from './nomap';

describe('a browser that cannot draw the map', () => {
  it("knows MapLibre's WebGL failure from other start-up errors", () => {
    expect(isNoMapError(new Error('Failed to initialize WebGL.'))).toBe(true);
    expect(isNoMapError('webglcontextcreationerror')).toBe(true);
    expect(isNoMapError(new TypeError('Failed to fetch dynamically imported module'))).toBe(false);
    expect(isNoMapError(undefined)).toBe(false);
  });

  it('speaks the language the app would: the link, then the saved choice, then German', () => {
    expect(noMapLang('?lang=en', 'de')).toBe('en');
    expect(noMapLang('?from=52.5,13.4', 'en')).toBe('en');
    expect(noMapLang('', null)).toBe('de');
    expect(noMapLang('?lang=fr', 'xx')).toBe('de');
  });

  it('says what is wrong and what to try, in German and English', () => {
    for (const l of ['de', 'en'] as const) {
      expect(NO_MAP_TEXT[l].title).toMatch(/Karte|map/);
      expect(NO_MAP_TEXT[l].body).toMatch(/WebGL/);
    }
  });
});
