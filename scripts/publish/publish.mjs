// Publishes the built timetable files on a release without ever leaving one missing, on a
// small share of the repository's API budget (1000 calls an hour for the workflow token).
//
//   node scripts/publish/publish.mjs --dir work/out --tag timetable-latest --notes "…" [--keep walk.bin]
//
// - checksums.json on the release lists the sha256 of every published file, so only new
//   and changed files are sent: a rerun on the same day costs a handful of calls.
// - A changed file X goes up as X.next first; only then does the old X step aside (X.old)
//   and X.next take its name. A run that breaks half way leaves X.next or X.old, and the
//   next run puts them back before anything else.
// - When most files changed (a new feed), a fresh release gets all of them and then takes
//   over the tag: one call per file instead of four, and the old release stays whole until
//   the switch.
// - Before touching anything the run checks the remaining budget; if it does not cover the
//   plan it waits for the reset (up to --wait minutes) or stops with nothing changed.
// - --keep names files the build may skip (walk.bin without new footpaths): they stay
//   published as they are.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { MANIFEST, NEXT, OLD, plan, repairs } from './plan.mjs';

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string', default: 'work/out' },
    tag: { type: 'string', default: 'timetable-latest' },
    title: { type: 'string', default: 'Timetable (latest)' },
    notes: { type: 'string', default: '' },
    keep: { type: 'string', multiple: true, default: [] },
    'swap-above': { type: 'string', default: '300' },
    wait: { type: 'string', default: '25' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN must be set');
const API = `https://api.github.com/repos/${repo}`;
let calls = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A dropped connection or a server error (5xx): worth trying again. */
const transient = (e) => !(e instanceof HttpError) || e.status >= 500;
class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * One API call. Calls that can safely be repeated (GET, PATCH, DELETE) are tried up to
 * three times on a dropped connection or a server error; POSTs are not (they would create
 * twice), uploads retry on their own (see upload).
 */
async function gh(method, url, body, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ghOnce(method, url, body, headers);
    } catch (e) {
      if (method === 'POST' || attempt >= 3 || !transient(e)) throw e;
      console.log(`${method} ${url} failed (${e.message.slice(0, 120)}), trying again`);
      await sleep(2000 * attempt);
    }
  }
}

async function ghOnce(method, url, body, headers) {
  calls++;
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok)
    throw new HttpError(`${method} ${url}: ${res.status} ${await res.text()}`, res.status);
  return res.status === 204 ? null : res.json();
}

/** Remaining calls of the hour; reading it does not count against the budget. */
async function budget() {
  // Through gh(): a 502 here is retried like any other call.
  const { resources } = await gh('GET', 'https://api.github.com/rate_limit');
  return resources.core;
}

async function assetsOf(release) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await gh('GET', `/releases/${release.id}/assets?per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

/**
 * Uploads a file as an asset, up to three tries: a connection that drops mid-upload (it
 * happened at 39 MB in) can leave a half-uploaded asset under the name, which is deleted
 * before the next try.
 */
async function upload(release, name, data) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ghOnce(
        'POST',
        `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        data,
        { 'content-type': 'application/octet-stream' },
      );
    } catch (e) {
      // 422: the name is taken, by a half-uploaded asset from the failed try.
      const retry = transient(e) || (attempt > 1 && e.status === 422);
      if (attempt >= 3 || !retry) throw e;
      console.log(`Upload of ${name} failed (${e.message.slice(0, 120)}), trying again`);
      await sleep(3000 * attempt);
      const half = (await assetsOf(release)).find((a) => a.name === name);
      if (half) await drop(half);
    }
  }
}
/** An asset's bytes (the API answers with a redirect to the file). */
async function download(asset) {
  calls++;
  const res = await fetch(asset.url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`download ${asset.name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
const rename = (asset, name) => gh('PATCH', `/releases/assets/${asset.id}`, { name });
const drop = (asset) => gh('DELETE', `/releases/assets/${asset.id}`);

// ---------- what was built ----------
const files = readdirSync(args.dir).filter(
  (f) => /\.(json|bin)$/.test(f) && f !== MANIFEST && !f.startsWith('.'),
);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const local = new Map(files.map((f) => [f, sha(readFileSync(join(args.dir, f)))]));

// ---------- what is published ----------
let release = await gh('GET', `/releases/tags/${args.tag}`);
// Without the tag's release an "-old-" one may hold the last files: then nothing is removed.
const tagged = Boolean(release);
if (!release && args['dry-run']) {
  console.log(`Dry run: no release ${args.tag} yet; it would be created with every file.`);
  process.exit(0);
}
if (!release) {
  release = await gh('POST', '/releases', {
    tag_name: args.tag,
    name: args.title,
    body: args.notes,
    make_latest: 'false',
  });
}
// Fresh or old releases an earlier broken run left behind (best effort; they are unused).
const leftovers = tagged
  ? ((await gh('GET', '/releases?per_page=100')) ?? []).filter((r) =>
      new RegExp(`^${args.tag}-(next|old)-\\d+$`).test(r.tag_name),
    )
  : [];
for (const r of leftovers) {
  if (args['dry-run']) break;
  console.log(`Removing leftover release ${r.tag_name}`);
  await gh('DELETE', `/releases/${r.id}`).catch((e) => console.log(`(${e.message})`));
  await gh('DELETE', `/git/refs/tags/${r.tag_name}`).catch(() => undefined);
}
let assets = await assetsOf(release);
// A broken earlier run: put X back from X.next (or X.old) first.
const repaired = repairs(assets.map((a) => a.name));
for (const r of repaired) {
  console.log(`${args['dry-run'] ? 'Would repair' : 'Repairing'} ${r.to} from ${r.from}`);
  if (args['dry-run']) continue;
  await rename(
    assets.find((a) => a.name === r.from),
    r.to,
  );
}
if (repaired.length && !args['dry-run']) assets = await assetsOf(release);
const byName = new Map(assets.map((a) => [a.name, a]));
let published = new Map();
if (byName.has(MANIFEST)) {
  const text = new TextDecoder().decode(await download(byName.get(MANIFEST)));
  published = new Map(Object.entries(JSON.parse(text).files ?? {}));
}
// Kept files stay as they are, with their published checksum.
for (const k of args.keep) {
  if (!local.has(k) && byName.has(k)) local.set(k, published.get(k) ?? '');
}
const keptOnly = new Set(args.keep.filter((k) => !files.includes(k)));
const swapAbove = Number(args['swap-above']);
if (!Number.isFinite(swapAbove))
  throw new Error(`--swap-above must be a number, got ${args['swap-above']}`);
const p = plan(local, published, [...byName.keys()], swapAbove);
// A kept file that is not rebuilt is never replaced.
p.replace = p.replace.filter((n) => !keptOnly.has(n));
console.log(
  `Plan: ${p.mode}, ${p.add.length} new, ${p.replace.length} changed, ${p.remove.length} gone, about ${p.calls} calls`,
);
if (args['dry-run'] || p.mode === 'none') {
  if (!args['dry-run'] && p.mode === 'none' && release.body !== args.notes && args.notes) {
    await gh('PATCH', `/releases/${release.id}`, { body: args.notes });
  }
  console.log(`Done, ${calls} calls.`);
  process.exit(0);
}

// ---------- enough budget? ----------
const waitUntil = Date.now() + Number(args.wait) * 60_000;
for (;;) {
  const b = await budget();
  if (b.remaining >= p.calls + 20) break;
  const reset = b.reset * 1000;
  if (reset > waitUntil) {
    throw new Error(
      `API budget too low (${b.remaining} left, plan needs ${p.calls}); nothing was changed`,
    );
  }
  console.log(`API budget ${b.remaining} < ${p.calls}: waiting for the reset`);
  await new Promise((r) => setTimeout(r, reset - Date.now() + 5000));
}

const manifest = new TextEncoder().encode(
  JSON.stringify({ files: Object.fromEntries([...local].sort()) }, null, 1),
);
const data = (name) => readFileSync(join(args.dir, name));

if (p.mode === 'inplace') {
  await gh('PATCH', `/releases/${release.id}`, { body: args.notes });
  for (const name of p.add) {
    console.log(`Adding ${name}`);
    await upload(release, name, data(name));
  }
  // Replace: the new copy is up before the old one moves.
  const swapIn = async (name, bytes) => {
    const next = await upload(release, name + NEXT, bytes);
    const old = byName.get(name);
    if (old) await rename(old, name + OLD);
    await rename(next, name);
    if (old) await drop(old);
  };
  for (const name of p.replace) {
    console.log(`Updating ${name}`);
    await swapIn(name, data(name));
  }
  await swapIn(MANIFEST, manifest);
  for (const name of p.remove) {
    console.log(`Removing ${name}`);
    await drop(byName.get(name));
  }
} else {
  // A fresh release with every file, then it takes over the tag.
  const stamp = Date.now();
  const fresh = await gh('POST', '/releases', {
    tag_name: `${args.tag}-next-${stamp}`,
    name: args.title,
    body: args.notes,
    make_latest: 'false',
  });
  try {
    for (const name of local.keys()) {
      if (keptOnly.has(name)) {
        // Not rebuilt: copy the published file over.
        await upload(fresh, name, await download(byName.get(name)));
      } else {
        await upload(fresh, name, data(name));
      }
    }
    await upload(fresh, MANIFEST, manifest);
  } catch (e) {
    // The published release is untouched: the half-filled fresh one goes, with its tag.
    await gh('DELETE', `/releases/${fresh.id}`).catch(() => undefined);
    await gh('DELETE', `/git/refs/tags/${args.tag}-next-${stamp}`).catch(() => undefined);
    throw e;
  }
  console.log(`Swapping ${args.tag} to the fresh release`);
  await gh('PATCH', `/releases/${release.id}`, { tag_name: `${args.tag}-old-${stamp}` });
  try {
    await gh('PATCH', `/releases/${fresh.id}`, { tag_name: args.tag });
  } catch (e) {
    // Put the old release back under the tag, so it is never without one.
    await gh('PATCH', `/releases/${release.id}`, { tag_name: args.tag });
    throw e;
  }
  // The swap is done: cleaning up the old release must not fail the run (a 502 here once
  // kept the new files from being deployed). A leftover "-old-" release is harmless.
  await gh('DELETE', `/releases/${release.id}`).catch((e) =>
    console.log(`::warning title=Old release left over::${e.message}`),
  );
  for (const t of [`${args.tag}-old-${stamp}`, `${args.tag}-next-${stamp}`]) {
    await gh('DELETE', `/git/refs/tags/${t}`).catch((e) => console.log(`(tag ${t}: ${e.message})`));
  }
}
console.log(`Done, ${calls} calls.`);
