/**
 * The street list for the app's search: every named street in the region, so street names
 * show on the first keystroke without asking the address service (Photon answers late and
 * misses some streets). Read from the same OPL file as the walking network.
 *
 * Ways of one name that lie close together are one street; the same name further away
 * (a Hauptstraße in each village) is another. Each street keeps one point on it, near the
 * middle of its ways, the postcode most of its ways carry and the town of the stops
 * around it (`townOf`), so twenty Karl-Marx-Straßen can be told apart.
 *
 * streets.json: { v: 1, box: [minLon, minLat, maxLon, maxLat], streets } where `streets`
 * has one line per name, sorted: `name\tplz|town|y,x;plz|town|y,x…`, with y and x the
 * point's offset from the box's south-west corner in 1e-4 degrees (about 10 m), in base 36.
 * plz and town may be empty.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { REGION, type Box } from '../../routing/src/regions.ts';
import { distanceM } from './geo.ts';
import { parseTags } from './walk.ts';

/** Road types that make up the street names people search for. */
const STREET_TYPES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'pedestrian',
  'road',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);
/** Ways of one name closer than this are the same street. */
const SAME_STREET_M = 2000;
const STEP = 1e-4;

export interface Street {
  name: string;
  postcode: string;
  town?: string;
  lat: number;
  lon: number;
}

/** Reads the named streets inside the region's box from OPL lines (nodes before ways). */
export async function buildStreets(
  lines: AsyncIterable<string> | Iterable<string>,
  box: Box = REGION.bbox,
): Promise<Street[]> {
  const [w, s, e, n] = box;
  const nodes = new Map<number, [number, number]>();
  const ways = new Map<string, { lat: number; lon: number; postcode: string }[]>();
  for await (const line of lines) {
    if (line.charCodeAt(0) === 110 /* n */) {
      let x = NaN;
      let y = NaN;
      const parts = line.split(' ');
      for (const p of parts) {
        if (p[0] === 'x') x = Number(p.slice(1));
        else if (p[0] === 'y') y = Number(p.slice(1));
      }
      if (x >= w && x <= e && y >= s && y <= n) nodes.set(Number(parts[0]!.slice(1)), [y, x]);
    } else if (line.charCodeAt(0) === 119 /* w */) {
      const parts = line.split(' ');
      const tags = parseTags(parts.find((p) => p[0] === 'T') ?? 'T');
      const name = tags.get('name');
      if (!name || !STREET_TYPES.has(tags.get('highway') ?? '')) continue;
      const refs = (parts.find((p) => p[0] === 'N') ?? 'N')
        .slice(1)
        .split(',')
        .map((r) => nodes.get(Number(r.slice(1))))
        .filter((p) => p !== undefined);
      const mid = refs[refs.length >> 1];
      if (!mid) continue;
      const postcode = tags.get('postal_code') ?? tags.get('addr:postcode') ?? '';
      let list = ways.get(name);
      if (!list) ways.set(name, (list = []));
      list.push({ lat: mid[0], lon: mid[1], postcode });
    }
  }
  const out: Street[] = [];
  for (const [name, list] of ways) {
    // Single-link groups: a way joins every group it is close to.
    const parent = list.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (distanceM(list[i]!.lat, list[i]!.lon, list[j]!.lat, list[j]!.lon) < SAME_STREET_M)
          parent[root(i)] = root(j);
    const groups = new Map<number, typeof list>();
    list.forEach((p, i) => {
      const g = groups.get(root(i));
      if (g) g.push(p);
      else groups.set(root(i), [p]);
    });
    for (const g of groups.values()) {
      const lat = g.reduce((a, p) => a + p.lat, 0) / g.length;
      const lon = g.reduce((a, p) => a + p.lon, 0) / g.length;
      // A point on the street itself: the way middle nearest the group's centre.
      const at = g.reduce((b, p) =>
        distanceM(p.lat, p.lon, lat, lon) < distanceM(b.lat, b.lon, lat, lon) ? p : b,
      );
      const counts = new Map<string, number>();
      for (const p of g) if (p.postcode) counts.set(p.postcode, (counts.get(p.postcode) ?? 0) + 1);
      const postcode = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      out.push({ name, postcode, lat: at.lat, lon: at.lon });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.lat - b.lat);
}

/** Reads a plain or gzipped OPL file into the street list. */
export async function readStreetsFile(path: string, box?: Box): Promise<Street[]> {
  let input: NodeJS.ReadableStream = createReadStream(path);
  if (path.endsWith('.gz')) input = input.pipe(createGunzip());
  return buildStreets(createInterface({ input, crlfDelay: Infinity }), box);
}

/** streets.json (see the top of this file). */
export function encodeStreets(streets: Street[], box: Box = REGION.bbox) {
  const [w, s] = box;
  const lines: string[] = [];
  let last = '';
  for (const st of streets) {
    const y = Math.round((st.lat - s) / STEP).toString(36);
    const x = Math.round((st.lon - w) / STEP).toString(36);
    const point = `${st.postcode}|${clean(st.town ?? '')}|${y},${x}`;
    const name = clean(st.name);
    if (name === last) lines[lines.length - 1] += `;${point}`;
    else lines.push(`${name}\t${point}`);
    last = name;
  }
  return { v: 1, box, streets: lines.join('\n') };
}

/** Tabs, newlines, ; and | would break the format; names never need them. */
const clean = (s: string) => s.replace(/[\t\n;|]/g, ' ');

/** How many of the nearest stops vote on a street's town, and how far they may be. */
const TOWN_STOPS = 6;
const TOWN_M = 3000;

/**
 * The town a stop name gives, if any: "Wustermark, Hafenstr." and "Knoblaucher Weg,
 * Wustermark" both hold "Wustermark", "Preysingstr. (Berlin)" holds "Berlin". Every part
 * is a candidate; the town is the one the stops around a street share (`addTowns`).
 */
export function townParts(stopName: string): string[] {
  if (/\(Berlin\)/.test(stopName)) return ['Berlin'];
  if (!stopName.includes(', ')) return [];
  return stopName.split(', ').map((p) => p.replace(/\s*\[.*\]$/, '').trim());
}

/** Gives each street the town most of its nearby stops name (Berlin streets get "Berlin"). */
export function addTowns(
  streets: Street[],
  stops: readonly { name: string; lat: number; lon: number }[],
): void {
  const CELL = 0.05;
  const cell = (lat: number, lon: number) => `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`;
  const grid = new Map<string, { parts: string[]; lat: number; lon: number }[]>();
  for (const s of stops) {
    const parts = townParts(s.name);
    if (!parts.length) continue;
    const k = cell(s.lat, s.lon);
    const list = grid.get(k);
    if (list) list.push({ parts, lat: s.lat, lon: s.lon });
    else grid.set(k, [{ parts, lat: s.lat, lon: s.lon }]);
  }
  for (const st of streets) {
    const cy = Math.floor(st.lat / CELL);
    const cx = Math.floor(st.lon / CELL);
    const near: { parts: string[]; d: number }[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const s of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
          const d = distanceM(st.lat, st.lon, s.lat, s.lon);
          if (d < TOWN_M) near.push({ parts: s.parts, d });
        }
    near.sort((a, b) => a.d - b.d);
    const votes = new Map<string, number>();
    for (const s of near.slice(0, TOWN_STOPS))
      for (const p of new Set(s.parts)) votes.set(p, (votes.get(p) ?? 0) + 1);
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    // A part only one stop names is that stop's street, not a town.
    if (best && best[1] >= 2) st.town = best[0];
  }
}
