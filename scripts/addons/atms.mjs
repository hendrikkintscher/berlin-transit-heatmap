#!/usr/bin/env node
// The Cash Group ATMs add-on (S049): turns OpenStreetMap's ATMs, as `osmium export -f
// geojsonseq` writes them, into the small file the app loads when the layer is on:
//
//   node scripts/addons/atms.mjs <atms.geojsonseq> <out/atm.json>
//
// An ATM counts as Cash Group when its operator, brand, network or name names one of the
// four banks (decision 0014). Opening hours come from the ATM itself (`opening_hours` on
// an ATM, `opening_hours:atm` elsewhere), never from the bank it stands in. A bank tagged
// `atm=yes` is dropped when an ATM of the same bank is mapped within 40 m of it.
// Output: {"v":1,"banks":[…],"hours":[…],"p":[[lon,lat,bank,hours or -1],…]}, sorted,
// so an unchanged map gives the same file (and the same data version).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BANKS = ['Commerzbank', 'Deutsche Bank', 'HypoVereinsbank', 'Postbank'];
const PATTERNS = [
  /commerzbank/i,
  /deutsche bank\b/i,
  /hypovereinsbank|unicredit|\bhvb\b/i,
  /postbank/i,
];
const FIELDS = ['operator', 'brand', 'network', 'name'];
const SAME_PLACE_M = 40;

/** The Cash Group bank an OSM object belongs to (an index into BANKS), or -1. */
export function bankOf(tags) {
  for (const field of FIELDS) {
    const value = tags[field];
    if (!value) continue;
    const i = PATTERNS.findIndex((re) => re.test(value));
    if (i >= 0) return i;
  }
  return -1;
}

/** A feature's point: the point itself, or the mean of a line's or an outer ring's points. */
export function pointOf(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0][0]
        : geometry.type === 'LineString'
          ? geometry.coordinates
          : null;
  if (!ring?.length) return null;
  const sum = ring.reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

const metres = ([x1, y1], [x2, y2]) =>
  Math.hypot((x1 - x2) * 111320 * Math.cos((y1 * Math.PI) / 180), (y1 - y2) * 110540);
const round5 = (x) => Math.round(x * 1e5) / 1e5;

/** The add-on file for these GeoJSON features (osmium's export of ATMs and banks with ATMs). */
export function buildAtms(features) {
  const atms = [];
  for (const f of features) {
    const tags = f.properties ?? {};
    const bank = bankOf(tags);
    const at = f.geometry && pointOf(f.geometry);
    if (bank < 0 || !at) continue;
    const own = tags.amenity === 'atm';
    const hours = (own ? tags.opening_hours : tags['opening_hours:atm']) || null;
    atms.push({ at: [round5(at[0]), round5(at[1])], bank, hours, own });
  }
  // A bank's own `atm=yes` beside a mapped ATM of the same bank is the same machine.
  const kept = atms.filter(
    (a) =>
      a.own || !atms.some((b) => b.own && b.bank === a.bank && metres(a.at, b.at) <= SAME_PLACE_M),
  );
  kept.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1] || a.bank - b.bank);
  const hours = [...new Set(kept.map((a) => a.hours).filter(Boolean))].sort();
  return {
    v: 1,
    banks: BANKS,
    hours,
    p: kept.map((a) => [a.at[0], a.at[1], a.bank, a.hours ? hours.indexOf(a.hours) : -1]),
  };
}

/** The record separator osmium writes before each feature. */
const RS = String.fromCharCode(0x1e);
/** The features of a GeoJSON text sequence (RFC 8142: each line may start with RS). */
export const readSeq = (text) =>
  text
    .split('\n')
    .map((line) => (line.startsWith(RS) ? line.slice(1) : line).trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: atms.mjs <atms.geojsonseq> <atm.json>');
    process.exit(1);
  }
  const out = buildAtms(readSeq(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(out));
  const per = BANKS.map((b, i) => `${b} ${out.p.filter((p) => p[2] === i).length}`).join(', ');
  const withHours = out.p.filter((p) => p[3] >= 0).length;
  console.log(`${out.p.length} Cash Group ATMs (${per}), ${withHours} with opening hours`);
}
