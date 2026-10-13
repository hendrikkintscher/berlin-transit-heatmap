#!/usr/bin/env node
// Writes the data files' versions into the built start page, so the app asks for
// `walk.bin?v=<hash>` and the service worker can keep such files until the hash changes
// (a deploy no longer makes every phone download them again):
//   node scripts/publish/data-versions.mjs <data dir> <index.html>
// Versions are the first 8 hex digits of a sha256: one per file, and one for all the
// timetables together (they come from one build). The page carries them in
// <meta name="data-v" content="{…}">.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The version key of a data file: "timetable" for all timetables, else its name without extension. */
export const versionKey = (name) =>
  name.startsWith('timetable-') ? 'timetable' : name.replace(/\.[^.]+$/, '');

const sha8 = (data) => createHash('sha256').update(data).digest('hex').slice(0, 8);

/** {key: sha8} for files given as [name, contents] pairs. */
export function dataVersions(files) {
  const out = {};
  const timetables = [];
  for (const [name, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (versionKey(name) === 'timetable') timetables.push(`${name}:${sha8(data)}`);
    else out[versionKey(name)] = sha8(data);
  }
  if (timetables.length) out.timetable = sha8(timetables.join('\n'));
  return out;
}

/**
 * The page with the versions in its data-v meta tag. A new tag goes right after the
 * charset, ahead of the inline script that starts the worker and reads it.
 */
export function withVersions(html, versions) {
  const tag = `<meta name="data-v" content='${JSON.stringify(versions)}' />`;
  const re = /<meta name="data-v"[^>]*>/;
  if (re.test(html)) return html.replace(re, tag);
  const charset = /<meta charset="UTF-8" \/>\n/;
  if (!charset.test(html)) throw new Error('data-versions: no charset meta in the page');
  return html.replace(charset, (m) => `${m}    ${tag}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, page] = process.argv.slice(2);
  if (!dir || !page) {
    console.error('usage: data-versions.mjs <data dir> <index.html>');
    process.exit(1);
  }
  const names = readdirSync(dir).filter((n) => /\.(bin|json)$/.test(n));
  const versions = dataVersions(names.map((n) => [n, readFileSync(join(dir, n))]));
  writeFileSync(page, withVersions(readFileSync(page, 'utf8'), versions));
  console.log(`Data versions in ${page}:`, versions);
}
