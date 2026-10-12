#!/usr/bin/env node
// Prints one field of the region config (packages/routing/src/regions.ts) for the workflows:
//   node scripts/region.mjs gtfsUrl          -> https://www.vbb.de/vbbgtfs
//   node scripts/region.mjs osmBbox          -> 12.8,52.2,14,52.85
//   node scripts/region.mjs osmExtracts      -> berlin brandenburg
// Arrays print comma-separated, except osmExtracts (space-separated, for a shell loop).
import { REGION } from '../packages/routing/src/regions.ts';

const field = process.argv[2];
if (!field || !(field in REGION)) {
  console.error(`usage: region.mjs <${Object.keys(REGION).join('|')}>`);
  process.exit(1);
}
const value = REGION[field];
console.log(Array.isArray(value) ? value.join(field === 'osmExtracts' ? ' ' : ',') : value);
