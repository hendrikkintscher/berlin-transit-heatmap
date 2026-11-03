import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as routing from '@berlin-transit-heatmap/routing';
import { loadTimetable, reverseTimetable } from '@berlin-transit-heatmap/routing';
import { A, D, KM_LAT, miniTimetable, STOP_POS } from '../../routing/test/fixture';

// Counts the worker's searches for the map's place's walks to its stops (the part S027 moves
// off the tap; the tapped place's own walks are found inside tripBetween, not counted).
vi.mock('@berlin-transit-heatmap/routing', async (real) => {
  const r = await real<typeof routing>();
  return { ...r, walksToStops: vi.fn(r.walksToStops) };
});

const H10 = 10 * 3600;
const raw = miniTimetable('day');
const fwd = loadTimetable(raw);
const back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
const near = (s: number) => ({ lat: STOP_POS[s]!.lat + 0.1 * KM_LAT, lon: STOP_POS[s]!.lon });
const goal = near(D);
const tap = { type: 'trip' as const, id: 1, ...near(A) };

// The worker's modules expect a worker's scope.
let trips: typeof import('./worker-trips');
let runs: typeof import('./worker-runs');
beforeAll(async () => {
  vi.stubGlobal('self', globalThis);
  trips = await import('./worker-trips');
  runs = await import('./worker-runs');
});

/** A map to the Ziel `at` leaving at 10:00 (Typisch), with the forward timetable in. */
const goalMap = (at = goal) => ({
  tt: back,
  runs: [runs.goalRun(back, at, 'typical', H10, 'walk')],
  direction: 'arrive' as const,
  leaving: H10,
  travel: 'walk' as const,
  leaveAt: null,
  from: H10,
  otherTt: fwd,
});
const walkSearches = () => vi.mocked(routing.walksToStops).mock.calls.length;

describe('warmGoalWalks (S027)', () => {
  it("finds the Ziel's walks ahead, so the first tap need not", () => {
    trips.setLastTrip(goalMap());
    const before = walkSearches();
    trips.warmGoalWalks();
    expect(walkSearches()).toBe(before + 1);
    expect(vi.mocked(routing.walksToStops).mock.calls.at(-1)![1]).toEqual(goal);
    // Again: kept, nothing new.
    trips.warmGoalWalks();
    expect(walkSearches()).toBe(before + 1);
    const warm = trips.tapTrip(tap);
    expect(walkSearches()).toBe(before + 1);
    expect(warm.journeys[0]?.legs.length).toBeGreaterThan(0);
  });

  it('gives the same trip as a cold first tap', () => {
    trips.setLastTrip(goalMap());
    trips.warmGoalWalks();
    const warm = trips.tapTrip(tap);
    // A map to another Ziel replaces the kept walks; back at this one, the tap finds them.
    trips.setLastTrip(goalMap(near(A)));
    trips.warmGoalWalks();
    trips.setLastTrip(goalMap());
    const before = walkSearches();
    const cold = trips.tapTrip(tap);
    expect(walkSearches()).toBe(before + 1);
    expect(cold).toEqual(warm);
  });

  it('leaves other maps alone', () => {
    trips.setLastTrip({
      tt: fwd,
      runs: [runs.run(fwd, near(A), true, 'walk')],
      direction: 'depart',
      travel: 'walk',
      leaveAt: H10,
      from: H10,
      otherTt: back,
    });
    const before = walkSearches();
    trips.warmGoalWalks();
    expect(walkSearches()).toBe(before);
  });

  it('waits for the timetable the other way round', () => {
    trips.setLastTrip({ ...goalMap(near(A)), otherTt: undefined });
    const before = walkSearches();
    trips.warmGoalWalks();
    expect(walkSearches()).toBe(before);
  });
});
