import { describe, expect, it } from 'vitest';
import { loadTimetable, type Journey, type PreparedTimetable } from '../src';
import {
  appTrip,
  bestOf,
  motisTrips,
  stayOn,
  stayOnTransfer,
  vbbTrips,
  why,
  type TripSummary,
} from '../bench/quality';
import { A, B, C, D, F, miniTimetable } from './fixture';

const H10 = 10 * 3600;
const tt = loadTimetable(miniTimetable('day'));

/** The prepared route whose stops start with `first`, `second`. */
function route(t: PreparedTimetable, first: number, second: number) {
  for (let r = 0; r < t.routeTripCount.length; r++) {
    const o = t.routeStopOffset[r];
    if (t.routeStops[o] === first && t.routeStops[o + 1] === second) return r;
  }
  throw new Error('no such route');
}
const ride = (r: number, stops: number[], name: string, fromPos = 0) => ({
  type: 'ride' as const,
  name,
  mode: 'ubahn' as const,
  from: stops[0],
  to: stops[stops.length - 1],
  stops,
  route: r,
  fromPos,
});

describe('appTrip', () => {
  it('times the rides from the leaving moment', () => {
    const j: Journey = {
      legs: [
        { type: 'walk', seconds: 60 },
        ride(route(tt, A, B), [A, B], 'U1'),
        { type: 'walk', seconds: 300 },
      ],
      transfers: 0,
    };
    // Walking 1 min from 10:00 misses the 10:00 train: the 10:10 one, at B 10:12.
    const t = appTrip(tt, j, H10)!;
    expect(t.rides[0]).toMatchObject({
      line: 'U1',
      from: 'A',
      to: 'B',
      dep: H10 + 600,
      arr: H10 + 720,
    });
    expect(t.arrive).toBe(H10 + 1020);
    expect([t.walkStart, t.walkMid, t.walkEnd]).toEqual([60, 0, 300]);
  });
});

describe('stayOn', () => {
  it('finds a later stop of the last vehicle with less walking and no later arrival', () => {
    // Off the U1 at B (10:02), then 10 min on foot; the same train is at C at 10:04, 1 min away.
    const j: Journey = {
      legs: [ride(route(tt, A, B), [A, B], 'U1'), { type: 'walk', seconds: 600 }],
      transfers: 0,
    };
    const egress = new Float32Array(tt.stopCount).fill(Infinity);
    egress[B] = 600;
    egress[C] = 60;
    egress[D] = 400;
    expect(stayOn(tt, j, H10, egress)).toEqual({
      stop: 'C',
      further: 1,
      arrive: H10 + 300,
      walkEnd: 60,
    });
  });

  it('keeps the app trip when staying on saves under 2 min of walking', () => {
    const j: Journey = {
      legs: [ride(route(tt, A, B), [A, B], 'U1'), { type: 'walk', seconds: 120 }],
      transfers: 0,
    };
    const egress = new Float32Array(tt.stopCount).fill(Infinity);
    // At C at 10:04 and 1 min on foot: 1 min less walking than the app's 2, not enough.
    egress[C] = 60;
    expect(stayOn(tt, j, H10, egress)).toBeNull();
  });
});

describe('stayOnTransfer', () => {
  it('finds a change at a later stop of the first vehicle onto the same next one', () => {
    // Off the U1 at B, 7 min on foot to C for the bus at 10:25; the U1 itself gets to C at 10:04.
    const bus = route(tt, C, 4);
    const j: Journey = {
      legs: [
        ride(route(tt, A, B), [A, B], 'U1'),
        { type: 'walk', seconds: 420 },
        ride(bus, [C, 4, F], '100'),
        { type: 'walk', seconds: 30 },
      ],
      transfers: 1,
    };
    expect(stayOnTransfer(tt, j, H10)).toMatchObject({
      ride: 0,
      line: 'U1',
      next: '100',
      getOff: 'B',
      stop: 'C',
      further: 1,
      walk: 420,
      walkThere: 0,
    });
  });
});

describe('the planners', () => {
  const day0 = Date.parse('2026-11-09T00:00:00+01:00');
  it('reads VBB journeys on planned times', () => {
    const [t] = vbbTrips(
      {
        journeys: [
          {
            legs: [
              {
                walking: true,
                plannedDeparture: '2026-11-09T10:00:00+01:00',
                plannedArrival: '2026-11-09T10:04:00+01:00',
              },
              {
                line: { name: 'M4' },
                origin: { name: 'X' },
                destination: { name: 'Y' },
                plannedDeparture: '2026-11-09T10:05:00+01:00',
                plannedArrival: '2026-11-09T10:20:00+01:00',
              },
              {
                walking: true,
                plannedDeparture: '2026-11-09T10:20:00+01:00',
                plannedArrival: '2026-11-09T10:23:00+01:00',
              },
            ],
          },
        ],
      },
      day0,
    );
    expect(t).toMatchObject({
      depart: H10,
      arrive: H10 + 1380,
      walkStart: 240,
      walkMid: 0,
      walkEnd: 180,
    });
    expect(t.rides).toEqual([{ line: 'M4', from: 'X', to: 'Y', dep: H10 + 300, arr: H10 + 1200 }]);
  });

  it('reads Transitous itineraries, preferring scheduled times', () => {
    const [t] = motisTrips(
      {
        itineraries: [
          {
            legs: [
              {
                mode: 'WALK',
                from: {},
                to: { name: 'X' },
                startTime: '2026-11-09T09:00:00Z',
                endTime: '2026-11-09T09:02:00Z',
              },
              {
                mode: 'BUS',
                routeShortName: '255',
                from: { name: 'X' },
                to: { name: 'Y' },
                startTime: '2026-11-09T09:06:00Z',
                endTime: '2026-11-09T09:20:00Z',
                scheduledStartTime: '2026-11-09T09:05:00Z',
                scheduledEndTime: '2026-11-09T09:18:00Z',
              },
            ],
          },
        ],
      },
      day0,
    );
    expect(t).toMatchObject({ depart: H10, arrive: H10 + 1080, walkStart: 120, walkEnd: 0 });
    expect(t.rides[0]).toMatchObject({ line: '255', dep: H10 + 300 });
  });

  it('picks the earliest arrival, then fewer rides, and classes the difference', () => {
    const t = (arrive: number, lines: string[], walk = 0): TripSummary => ({
      depart: 0,
      arrive,
      rides: lines.map((line) => ({ line, from: '', to: '', dep: 0, arr: 0 })),
      walkStart: walk,
      walkMid: 0,
      walkEnd: 0,
    });
    expect(bestOf([t(100, ['a', 'b']), t(100, ['c']), t(120, [])])!.rides).toHaveLength(1);
    expect(why(t(500, ['a']), t(300, ['a']), true)).toBe('stay-on');
    expect(why(t(500, ['a'], 600), t(300, ['a']), false)).toBe('longer-walk');
    expect(why(t(500, ['a', 'b']), t(300, ['c']), false)).toBe('fewer-rides');
    expect(why(t(500, ['a']), t(300, ['c']), false)).toBe('other-lines');
  });
});
