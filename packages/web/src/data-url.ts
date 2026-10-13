// Data files by version: the deploy writes each file's hash into the start page
// (<meta name="data-v">, scripts/publish/data-versions.mjs), and the app asks for
// `walk.bin?v=<hash>`. The service worker keeps such files until the hash changes instead
// of fetching them again on every start. Without versions (local runs) the plain name.

let versions: Record<string, string> = {};

/** Takes the versions from the meta tag's content (JSON); anything unreadable means none. */
export function setDataVersions(json: string | null | undefined): void {
  try {
    const v: unknown = json ? JSON.parse(json) : {};
    versions = v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    versions = {};
  }
}

/** The page's versions, as the start page carries them. */
export const pageDataVersions = (): string | undefined =>
  document.querySelector<HTMLMetaElement>('meta[name="data-v"]')?.content;

/** A data file's address in `base`, with its version when the page has one. */
export function dataUrl(base: string, name: string): URL {
  const url = new URL(name, base);
  const v = versions[name.startsWith('timetable-') ? 'timetable' : name.replace(/\.[^.]+$/, '')];
  if (v) url.searchParams.set('v', v);
  return url;
}
