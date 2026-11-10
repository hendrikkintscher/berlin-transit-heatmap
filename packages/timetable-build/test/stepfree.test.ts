import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTimetables, type BuildResult } from '../src/build.ts';
import { openGtfs } from '../src/source.ts';

// The mini fixture plus an entrance with a lift to platform A and stairs to platform B,
// and wheelchair_accessible: 1 on most trips, 2 (not accessible) on the ferry, 0 (not
// known) on the night bus N9.
const FIXTURE = join(import.meta.dirname, 'fixtures', 'stepfree');

let result: BuildResult;
beforeAll(async () => {
  const source = await openGtfs(FIXTURE);
  result = await buildTimetables(source, { feedVersion: 'test-feed' });
  source.close();
});

describe('step-free data', () => {
  it('marks platforms reached only by stairs', () => {
    const day = result.timetables.day!;
    const by = (id: string) => day.stops.find((s) => s.id === id)!;
    expect(by('B').stepFree).toBe(false);
    expect(by('A').stepFree).toBeUndefined();
    // No pathways at all: a street stop.
    expect(by('C').stepFree).toBeUndefined();
  });

  it('marks routes whose trips are not wheelchair-accessible', () => {
    const day = result.timetables.day!.routes;
    expect(day.filter((r) => r.stepFree === false).map((r) => r.name)).toEqual(['Fähre Wannsee']);
    for (const r of day) expect(r.accessUnknown).toBeUndefined();
  });

  it('counts trips without a mark as step-free, marked as not known (S055)', () => {
    const night = result.timetables.night!;
    expect(night.routes.map((r) => [r.name, r.stepFree, r.accessUnknown])).toEqual([
      ['N9', undefined, true],
    ]);
  });
});
