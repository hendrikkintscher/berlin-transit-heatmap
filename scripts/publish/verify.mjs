#!/usr/bin/env node
// Which downloaded files are not the release's current ones (S056): right after a build swaps
// in a fresh release, its public download links can serve the previous files for a moment,
// and a deploy started then shipped yesterday's timetable. download.sh compares every file
// with the sha256 the release API gives for it and fetches the stale ones again.
//
//   node scripts/publish/verify.mjs <dir> <digests.json> [file…]
//
// digests.json is the API's asset list, [{"name", "digest": "sha256:…"}…]. Prints the names
// of the files (all in <dir>, or those given) whose contents differ, one per line.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** {name: hex sha256} from the API's assets; assets without a digest are left out. */
export function digestsOf(assets) {
  const out = {};
  for (const a of assets)
    if (typeof a.digest === 'string' && a.digest.startsWith('sha256:'))
      out[a.name] = a.digest.slice(7);
  return out;
}

/** The files whose contents are not the release's: missing, or with another sha256. */
export function stale(dir, digests, names) {
  return names.filter((name) => {
    const want = digests[name];
    if (!want) return false;
    const file = join(dir, name);
    if (!existsSync(file)) return true;
    return createHash('sha256').update(readFileSync(file)).digest('hex') !== want;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, list, ...given] = process.argv.slice(2);
  if (!dir || !list) {
    console.error('usage: verify.mjs <dir> <digests.json> [file…]');
    process.exit(1);
  }
  const digests = digestsOf(JSON.parse(readFileSync(list, 'utf8')));
  const names = given.length ? given : Object.keys(digests);
  for (const name of stale(dir, digests, names)) console.log(name);
}
