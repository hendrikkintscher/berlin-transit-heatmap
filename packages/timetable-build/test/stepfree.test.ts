import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTimetables, type BuildResult } from '../src/build.ts';
import { openGtfs } from '../src/source.ts';

// The mini fixture plus an entrance with a lift to platform A and stairs to platform B,
// and wheelchair_accessible on every trip but the night bus N9.
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
    const night = result.timetables.night!;
    expect(night.routes.map((r) => [r.name, r.stepFree])).toEqual([['N9', false]]);
    for (const r of result.timetables.day!.routes) expect(r.stepFree).toBeUndefined();
  });
});
