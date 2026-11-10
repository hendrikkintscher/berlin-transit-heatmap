import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digestsOf, stale } from './verify.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

describe('download check (S056)', () => {
  it('reads the sha256 digests of the API asset list', () => {
    expect(
      digestsOf([
        { name: 'a.bin', digest: `sha256:${sha('a')}` },
        { name: 'b.bin', digest: null },
      ]),
    ).toEqual({ 'a.bin': sha('a') });
  });

  it('names the files that are still the old ones, or missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-'));
    writeFileSync(join(dir, 'new.bin'), 'new');
    writeFileSync(join(dir, 'old.bin'), 'yesterday');
    const digests = { 'new.bin': sha('new'), 'old.bin': sha('today'), 'gone.bin': sha('x') };
    expect(stale(dir, digests, ['new.bin', 'old.bin', 'gone.bin'])).toEqual([
      'old.bin',
      'gone.bin',
    ]);
    // A file the release has no digest for is not checked.
    expect(stale(dir, digests, ['other.bin'])).toEqual([]);
  });
});
