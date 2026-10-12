// What a timetable publish has to do, worked out before any call is made (see publish.mjs).

/** The release asset listing the sha256 of every published file, so a rerun can skip them. */
export const MANIFEST = 'checksums.json';
/** Suffixes of an update in flight: the new file waits as X.next, the old one steps aside as X.old. */
export const NEXT = '.next';
export const OLD = '.old';

/** Calls one in-place update of an existing file takes: upload, two renames, delete. */
const CALLS_REPLACE = 4;

/**
 * @param {Map<string, string>} local name -> sha256 of the files built now
 * @param {Map<string, string>} published name -> sha256 from the release's manifest
 * @param {string[]} assets names of the assets on the release now
 * @param {number} swapAbove switch to a fresh release when in place would take more calls
 * @returns {{ mode: 'none' | 'inplace' | 'swap', add: string[], replace: string[], remove: string[], calls: number }}
 */
export function plan(local, published, assets, swapAbove) {
  const have = new Set(assets);
  const add = [];
  const replace = [];
  for (const [name, sha] of local) {
    if (!have.has(name)) add.push(name);
    else if (published.get(name) !== sha) replace.push(name);
  }
  // Files no longer built (passed dates, retired files) and leftovers of a broken run.
  const remove = assets.filter((a) => a !== MANIFEST && !local.has(a));
  add.sort();
  replace.sort();
  remove.sort();
  if (!add.length && !replace.length && !remove.length && have.has(MANIFEST)) {
    return { mode: 'none', add, replace, remove, calls: 0 };
  }
  // The manifest itself is replaced (or added) last.
  const inplace = add.length + CALLS_REPLACE * (replace.length + 1) + remove.length;
  if (inplace <= swapAbove) return { mode: 'inplace', add, replace, remove, calls: inplace };
  // A fresh release: every file once, then a few calls to swap the tag and drop the old one.
  return { mode: 'swap', add, replace, remove, calls: local.size + 1 + 6 };
}

/**
 * Repairs an update a broken run left half done: X missing but X.next or X.old there.
 * @param {string[]} assets
 * @returns {{ from: string, to: string }[]} renames that restore X
 */
export function repairs(assets) {
  const have = new Set(assets);
  const out = [];
  for (const a of assets) {
    for (const suffix of [NEXT, OLD]) {
      if (!a.endsWith(suffix)) continue;
      const name = a.slice(0, -suffix.length);
      // Prefer the new file; fall back to the old one.
      if (have.has(name) || out.some((r) => r.to === name)) continue;
      if (suffix === OLD && have.has(name + NEXT)) continue;
      out.push({ from: a, to: name });
    }
  }
  return out;
}
