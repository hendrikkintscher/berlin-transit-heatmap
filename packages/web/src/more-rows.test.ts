import { describe, expect, it } from 'vitest';
import { bestRows } from './more-rows';

describe('bestRows', () => {
  it('keeps a faster other line and drops the later trips it beats', () => {
    const own = [
      { id: 'bus 10:10', start: 600, end: 3000 },
      { id: 'bus 10:20', start: 1200, end: 3600 },
    ];
    const sbahn = { id: 'S 10:15', start: 900, end: 2400 };
    expect(bestRows([...own, sbahn], 10).map((r) => r.id)).toEqual(['S 10:15', 'bus 10:20']);
  });
  it('keeps the first of equal rows and caps the list', () => {
    const rows = [
      { id: 'a', start: 60, end: 100 },
      { id: 'b', start: 60, end: 100 },
      { id: 'c', start: 120, end: 200 },
      { id: 'd', start: 180, end: 300 },
    ];
    expect(bestRows(rows, 2).map((r) => r.id)).toEqual(['a', 'c']);
  });
});
