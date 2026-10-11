import { describe, expect, it } from 'vitest';
import { STRINGS, initialLang } from './i18n';

describe('i18n', () => {
  it('defaults to German', () => {
    expect(initialLang('', null)).toBe('de');
    expect(initialLang('?from=52.5,13.4', 'fr')).toBe('de');
  });

  it('prefers the URL parameter over the saved choice', () => {
    expect(initialLang('?lang=en', 'de')).toBe('en');
    expect(initialLang('?lang=de', 'en')).toBe('de');
    expect(initialLang('', 'en')).toBe('en');
  });

  it('has the same placeholders in every language', () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, text] of Object.entries(STRINGS.de)) {
      expect(holes(STRINGS.en[key as keyof typeof STRINGS.de]), key).toEqual(holes(text));
    }
  });
});
