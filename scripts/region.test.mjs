import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// The workflows run the script with plain Node, which reads regions.ts by stripping its
// types; any TypeScript that cannot simply be stripped would break them.
const field = (name) =>
  execFileSync(process.execPath, ['scripts/region.mjs', name], { encoding: 'utf8' }).trim();

describe('region script', () => {
  it('prints the fields the workflows read, with plain Node', () => {
    expect(field('id')).toBe('berlin');
    expect(field('gtfsUrl')).toMatch(/^https:\/\//);
    expect(field('osmBbox')).toMatch(/^[\d.]+,[\d.]+,[\d.]+,[\d.]+$/);
    expect(field('osmExtracts')).toBe('berlin brandenburg');
  });
});
