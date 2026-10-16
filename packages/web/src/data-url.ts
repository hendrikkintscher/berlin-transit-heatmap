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

/**
 * Whether the deploy has a data file: always assumed without versions (local runs), where
 * a missing file is simply not found.
 */
export const dataPublished = (name: string): boolean =>
  !Object.keys(versions).length || versionKey(name) in versions;

/** The version key of a data file (as scripts/publish/data-versions.mjs gives it). */
const versionKey = (name: string) =>
  name.startsWith('timetable-') ? 'timetable' : name.replace(/\.[^.]+$/, '');

/** A data file's address in `base`, with its version when the page has one. */
export function dataUrl(base: string, name: string): URL {
  const url = new URL(name, base);
  const v = versions[versionKey(name)];
  if (v) url.searchParams.set('v', v);
  return url;
}
