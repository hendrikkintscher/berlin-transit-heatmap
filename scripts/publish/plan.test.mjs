import { describe, expect, it } from 'vitest';
import { MANIFEST, plan, repairs } from './plan.mjs';

const m = (o) => new Map(Object.entries(o));

describe('plan', () => {
  it('does nothing when every file is published unchanged', () => {
    const p = plan(m({ a: '1', b: '2' }), m({ a: '1', b: '2' }), ['a', 'b', MANIFEST], 300);
    expect(p).toMatchObject({ mode: 'none', calls: 0 });
  });

  it('adds new files, replaces changed ones and removes passed ones in place', () => {
    const p = plan(
      m({ a: '1', b: '9', 'timetable-20261013-10.bin': '3' }),
      m({ a: '1', b: '2', 'timetable-20261012-10.bin': '4' }),
      ['a', 'b', 'timetable-20261012-10.bin', MANIFEST],
      300,
    );
    expect(p).toEqual({
      mode: 'inplace',
      add: ['timetable-20261013-10.bin'],
      replace: ['b'],
      remove: ['timetable-20261012-10.bin'],
      calls: 1 + 4 * 2 + 1,
    });
  });

  it('replaces a file the manifest does not know', () => {
    const p = plan(m({ a: '1' }), m({}), ['a'], 300);
    expect(p.replace).toEqual(['a']);
  });

  it('removes leftovers of a broken run', () => {
    const p = plan(m({ a: '1' }), m({ a: '1' }), ['a', 'a.next', MANIFEST], 300);
    expect(p).toMatchObject({ mode: 'inplace', remove: ['a.next'] });
  });

  it('swaps to a fresh release when most files changed', () => {
    const names = Array.from({ length: 250 }, (_, i) => `f${i}`);
    const local = new Map(names.map((n) => [n, 'new']));
    const published = new Map(names.map((n) => [n, 'old']));
    const p = plan(local, published, [...names, MANIFEST], 300);
    expect(p.mode).toBe('swap');
    expect(p.calls).toBeLessThan(300);
  });
});

describe('repairs', () => {
  it('restores a file from its new copy, else from its old one', () => {
    expect(repairs(['a.next', 'a.old', 'b.old', 'c', 'c.next'])).toEqual([
      { from: 'a.next', to: 'a' },
      { from: 'b.old', to: 'b' },
    ]);
  });
});
