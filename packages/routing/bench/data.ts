import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTimetable, type Timetable } from '../src';

const REPO = 'hendrikkintscher/berlin-transit-heatmap';
const TAG = 'timetable-latest';

/** Local cache for real timetable files; override with ROUTING_DATA_DIR. */
export const DATA_DIR =
  process.env.ROUTING_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.data');

/**
 * The release's file for each window: 10:00 on the weekday reference day, and 02:00 in
 * the night after it (weekday-10 is also what the CI speed job times).
 */
export const TIMETABLE_FILES = {
  day: 'timetable-weekday-10.bin',
  night: 'timetable-weekday-02.bin',
};

/**
 * Path of a cached timetable file, downloading it from the `timetable-latest`
 * release if missing. Uses the GitHub API with GITHUB_TOKEN / GH_TOKEN when set
 * (needed while the repository is private), else the public download URL.
 */
export function ensureTimetable(window: 'day' | 'night'): Promise<string> {
  return ensureFile(TIMETABLE_FILES[window]);
}

/** Any file of the release (such as walk.bin), cached like the timetables. */
export async function ensureFile(name: string): Promise<string> {
  const file = join(DATA_DIR, name);
  if (existsSync(file)) return file;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  let res: Response;
  if (token) {
    const auth = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
    const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
      headers: { ...auth, Accept: 'application/vnd.github+json' },
    });
    if (!rel.ok) throw new Error(`Release ${TAG} lookup failed: ${rel.status} ${rel.statusText}`);
    const assets = ((await rel.json()) as { assets: { name: string; url: string }[] }).assets;
    const asset = assets.find((a) => a.name === name);
    if (!asset) throw new Error(`Release ${TAG} has no asset ${name}`);
    res = await fetch(asset.url, { headers: { ...auth, Accept: 'application/octet-stream' } });
  } else {
    res = await fetch(`https://github.com/${REPO}/releases/download/${TAG}/${name}`);
  }
  if (!res.ok) throw new Error(`Download of ${name} failed: ${res.status} ${res.statusText}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

export async function readTimetable(window: 'day' | 'night'): Promise<Timetable> {
  return decodeTimetable(readFileSync(await ensureTimetable(window))) as Timetable;
}
