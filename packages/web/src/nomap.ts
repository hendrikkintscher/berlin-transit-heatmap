// A browser that cannot draw the map (S035): without WebGL MapLibre throws while main.ts starts,
// and the page would stay empty with blank chips. boot.ts shows this instead. Kept tiny and
// without i18n.ts, as the entry loads it.

export type NoMapLang = 'de' | 'en';

export const NO_MAP_TEXT: Record<NoMapLang, { title: string; body: string }> = {
  de: {
    title: 'Dieser Browser kann die Karte nicht zeichnen.',
    body: 'Ihm fehlt WebGL. Probier einen anderen Browser oder schalte in den Einstellungen die Hardwarebeschleunigung ein.',
  },
  en: {
    title: 'This browser cannot draw the map.',
    body: 'It has no WebGL. Try another browser, or turn on hardware acceleration in its settings.',
  },
};

/** Whether the app failed to start because the map cannot get a WebGL context. */
export function isNoMapError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /webgl/i.test(message);
}

/** As i18n.ts picks the language: ?lang= first, then the saved choice, then German. */
export function noMapLang(search: string, stored: string | null): NoMapLang {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (fromUrl === 'de' || fromUrl === 'en') return fromUrl;
  return stored === 'en' ? 'en' : 'de';
}

/** Puts the message on the start card and hides the controls that cannot work without a map. */
export function showNoMap(doc: Document, lang: NoMapLang): void {
  const text = NO_MAP_TEXT[lang];
  doc.documentElement.lang = lang;
  doc.body.classList.add('no-map');
  const card = doc.getElementById('hint');
  if (!card) return;
  card.replaceChildren();
  const title = doc.createElement('p');
  title.textContent = text.title;
  const body = doc.createElement('small');
  body.textContent = text.body;
  card.append(title, body);
  card.hidden = false;
}
