import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as routing from '@berlin-transit-heatmap/routing';
import { loadTimetable, reverseTimetable } from '@berlin-transit-heatmap/routing';
import { A, D, KM_LAT, KM_LON, miniTimetable, STOP_POS } from '../../routing/test/fixture';

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

describe('tapAlternative (S045)', () => {
  /** The mini network with a bus 200 from C to a stop J near the tapped place; `hop` seconds long. */
  const feederMap = (hop: number) => {
    const day = miniTimetable('day');
    day.stops.push({
      id: 'j',
      name: 'J',
      lat: STOP_POS[A]!.lat + 2.7 * KM_LAT,
      lon: STOP_POS[A]!.lon + 2.3 * KM_LON,
    });
    day.routes.push({
      name: '200',
      mode: 'bus',
      stops: [2, day.stops.length - 1],
      trips: Array.from({ length: 12 }, (_, i) => [
        H10 + 300 + i * 1200,
        H10 + 300 + i * 1200 + hop,
      ]),
    });
    const f = loadTimetable(day);
    const b = loadTimetable(reverseTimetable(day, day.windowEnd, day.windowEnd + 3600));
    const origin = { lat: STOP_POS[A]!.lat, lon: STOP_POS[A]!.lon };
    return {
      tt: f,
      runs: [runs.run(f, origin, true, 'walk', true, H10)],
      direction: 'depart' as const,
      travel: 'walk' as const,
      leaveAt: null,
      from: H10,
      otherTt: b,
    };
  };
  /** 12 minutes' walk from F, a minute from J. */
  const far = { lat: STOP_POS[A]!.lat + 2.8 * KM_LAT, lon: STOP_POS[A]!.lon + 2.3 * KM_LON };
  const legs = (m: ReturnType<typeof trips.tapTrip>) =>
    m.journeys[0]?.legs.map((l) => (l.type === 'ride' ? l.name : 'walk'));

  it('finds the ride that arrives at the same second with a short walk', () => {
    trips.setLastTrip(feederMap(989));
    const shown = trips.tapTrip({ ...tap, ...far });
    expect(legs(shown)).toEqual(['U1', '100', 'walk']);
    const alt = trips.tapAlternative();
    expect(alt).toMatchObject({ where: 'end', line: '200', stop: 'J' });
    expect(alt!.saved).toBeGreaterThanOrEqual(9);
    expect(legs(alt!.trip)).toEqual(['U1', '200', 'walk']);
    expect(alt!.trip.journeys[0]!.arrive).toBe(shown.journeys[0]!.arrive);
  });

  it('finds nothing when the other ride arrives later', () => {
    trips.setLastTrip(feederMap(1000));
    trips.tapTrip({ ...tap, ...far });
    expect(trips.tapAlternative()).toBeNull();
  });

  it('is not searched for when the walks are short', () => {
    trips.setLastTrip(feederMap(989));
    const shown = trips.tapTrip({ ...tap, ...near(5) });
    expect(shown.journeys[0]).not.toBeNull();
    expect(trips.tapAlternative()).toBeNull();
  });

  it('finds nothing on a bike map', () => {
    trips.setLastTrip({ ...feederMap(989), travel: 'bike' as const });
    trips.tapTrip({ ...tap, ...far });
    expect(trips.tapAlternative()).toBeNull();
  });

  it('is posted after the trip as its own message, and dropped when a newer tap came', async () => {
    trips.setLastTrip(feederMap(989));
    trips.tapTrip({ ...tap, ...far });
    const posted: unknown[] = [];
    let latest = 1;
    await trips.postAlternative(
      1,
      () => latest,
      async () => {},
      (m) => posted.push(m),
    );
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'tripAlt', id: 1, line: '200', where: 'end' });
    // A newer tap while the worker let queued messages go first: nothing is posted.
    const dropped: unknown[] = [];
    await trips.postAlternative(
      1,
      () => latest,
      async () => {
        latest = 2;
      },
      (m) => dropped.push(m),
    );
    expect(dropped).toEqual([]);
  });

  it('is not searched for after a new map replaced the one the trip was found on', () => {
    trips.setLastTrip(feederMap(989));
    trips.tapTrip({ ...tap, ...far });
    trips.setLastTrip(feederMap(989));
    expect(trips.tapAlternative()).toBeNull();
  });

  it('finds the ride on a map to the place, Ankommen (the reversed timetable)', () => {
    // The map runs to the far place, arriving by 10:25; the tap is at the stop A.
    const m = feederMap(989);
    trips.setLastTrip({
      ...m,
      tt: m.otherTt,
      otherTt: m.tt,
      direction: 'arrive' as const,
      runs: [runs.run(m.otherTt, far, true, 'walk', true, -(H10 + 1500))],
      from: -(H10 + 1500),
    });
    const shown = trips.tapTrip({ ...tap, ...near(A) });
    expect(legs(shown)).toEqual(['walk', 'U1', '100', 'walk']);
    const alt = trips.tapAlternative();
    expect(alt).toMatchObject({ where: 'end', line: '200', stop: 'J' });
    expect(legs(alt!.trip)).toEqual(['walk', 'U1', '200', 'walk']);
    expect(alt!.trip.journeys[0]!.arrive).toBe(shown.journeys[0]!.arrive);
  });
});
