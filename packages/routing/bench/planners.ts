// Route quality check and suite (S036, S040): the other journey planners, VBB's own (HAFAS,
// via v6.vbb.transport.rest) and Transitous (MOTIS, api.transitous.org), on planned times.
// Answers are cached in <data>/providers/ by their question, so a rerun asks nobody again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Origin } from '../src';
import { DATA_DIR } from './data';
import { motisTrips, vbbTrips } from './quality';

const CACHE_DIR = join(DATA_DIR, 'providers');

let lastAsk = 0;
async function ask(provider: string, url: string, gapMs: number): Promise<unknown> {
  const key = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const file = join(CACHE_DIR, `${provider}-${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastAsk + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAsk = Date.now();
    const r = await fetch(url, {
      headers: { 'user-agent': 'berlin-transit-heatmap quality check' },
    })
      .then(async (x) => ({ status: x.status, body: await x.text() }))
      .catch((e: unknown) => ({ status: 0, body: String(e) }));
    if (r.status === 200) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, r.body);
      return JSON.parse(r.body);
    }
    // A planner that finds nothing answers 4xx: kept as "nothing", not asked again.
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ error: r.status, body: r.body.slice(0, 300) }));
      return null;
    }
    await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
  }
  return null;
}

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/**
 * VBB's trips from `from` to `to` leaving at `atMs` (or, with `arrive`, arriving by it);
 * `stepFree` asks for step-free trips only (HAFAS accessibility=complete).
 */
export async function vbb(
  from: Origin,
  to: Origin,
  atMs: number,
  day0: number,
  { arrive = false, stepFree = false } = {},
) {
  const q = new URLSearchParams({
    'from.latitude': from.lat.toFixed(5),
    'from.longitude': from.lon.toFixed(5),
    'from.address': 'Start',
    'to.latitude': to.lat.toFixed(5),
    'to.longitude': to.lon.toFixed(5),
    'to.address': 'Ziel',
    [arrive ? 'arrival' : 'departure']: iso(atMs),
    results: '4',
    stopovers: 'false',
    remarks: 'false',
    polylines: 'false',
    ...(stepFree ? { accessibility: 'complete' } : {}),
  });
  const json = await ask('vbb', `https://v6.vbb.transport.rest/journeys?${q}`, 800);
  return json ? vbbTrips(json as Parameters<typeof vbbTrips>[0], day0) : [];
}

/** Transitous' itineraries from `from` to `to` leaving at `atMs`. */
export async function transitous(from: Origin, to: Origin, atMs: number, day0: number) {
  const q = new URLSearchParams({
    fromPlace: `${from.lat.toFixed(5)},${from.lon.toFixed(5)}`,
    toPlace: `${to.lat.toFixed(5)},${to.lon.toFixed(5)}`,
    time: iso(atMs),
    numItineraries: '4',
    maxPreTransitTime: '1800',
    maxPostTransitTime: '1800',
  });
  const json = await ask('transitous', `https://api.transitous.org/api/v4/plan?${q}`, 1100);
  return json ? motisTrips(json as Parameters<typeof motisTrips>[0], day0) : [];
}
