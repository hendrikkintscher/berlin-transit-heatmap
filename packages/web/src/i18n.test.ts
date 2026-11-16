import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRINGS, initialLang, type Key } from './i18n';

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

  it('words the version line in each language, with the commit as text', () => {
    for (const l of ['de', 'en'] as const) {
      expect(STRINGS[l].appVersion).toContain('{version}');
      expect(STRINGS[l].appVersion).toContain('{commit}');
      expect(STRINGS[l].appVersionNoCommit).toContain('{version}');
    }
    expect(STRINGS.de.appVersion).not.toBe(STRINGS.en.appVersion);
    expect(STRINGS.de.appVersionNoCommit).not.toBe(STRINGS.en.appVersionNoCommit);
  });

  it('has fallback text in index.html that matches the German strings', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const flat = (v: string) => v.replace(/\s+/g, ' ').trim();
    const seen: string[] = [];
    // Each tag with a data-t* key: its text (data-t, up to the next tag) or the attribute it fills.
    for (const m of html.matchAll(/<[a-z][^>]*\bdata-t[^>]*>([^<]*)/g)) {
      const after = m[1]!;
      const tag = m[0].slice(0, m[0].length - after.length);
      const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
      const checks: [string | undefined, string | undefined][] = [
        [attr('data-t'), after],
        [attr('data-t-label'), attr('aria-label')],
        [attr('data-t-title'), attr('title')],
        [attr('data-t-placeholder'), attr('placeholder')],
      ];
      for (const [key, text] of checks) {
        if (!key || !flat(text ?? '')) continue; // Empty: filled in by setLang().
        expect(flat(text!), key).toBe(STRINGS.de[key as Key]);
        seen.push(key);
      }
    }
    expect(seen.length).toBeGreaterThan(40);
  });
});
