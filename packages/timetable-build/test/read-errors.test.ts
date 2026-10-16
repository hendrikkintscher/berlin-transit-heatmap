import { describe, expect, it } from 'vitest';
import { readStreetsFile } from '../src/streets.ts';
import { readOplFile } from '../src/walk.ts';

describe('reading OPL files', () => {
  // A gzipped file's read error used to be an uncaught 'error' event, not a rejection.
  it('rejects on a missing gzipped file', async () => {
    await expect(readOplFile('/nonexistent/walkways.opl.gz')).rejects.toThrow(/ENOENT/);
    await expect(readStreetsFile('/nonexistent/walkways.opl.gz')).rejects.toThrow(/ENOENT/);
  });
});
