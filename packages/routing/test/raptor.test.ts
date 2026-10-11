import { describe, expect, it } from 'vitest';
import { loadTimetable, travelTimes } from '../src';
import {
  A,
  B,
  C,
  D,
  E,
  F,
  G,
  H,
  I,
  KM_LON,
  miniTimetable,
  randomTimetable,
  rng,
  STOP_POS,
} from './fixture';
import { referenceTravelTimes, referenceTypical } from './reference';

const minutes = (s: number) => s / 60;

describe('travelTimes on the mini network', () => {
  const day = loadTimetable(miniTimetable('day'));
  const fromA = travelTimes(day, STOP_POS[A]);

  it('is zero at the origin stop and counts U-Bahn hops', () => {
    expect(fromA.stopSeconds[A]).toBe(0);
    expect(fromA.stopSeconds[B]).toBe(120);
    expect(fromA.stopSeconds[C]).toBe(240);
    expect(fromA.stopSeconds[D]).toBe(360);
  });

  it('picks the departure that makes the bus connection tight', () => {
    // U1 :20 -> C :24, bus :25 -> E :28 (8 min), F :31 (11 min).
    expect(minutes(fromA.stopSeconds[E])).toBe(8);
    expect(minutes(fromA.stopSeconds[F])).toBe(11);
  });

  it('uses footpaths between vehicles and the full departure range', () => {
    // Best is U1 :40 -> C :44, walk to G :47, tram :48 -> H :52 = 12 min.
    // A single 10:00 departure would give 22 min.
    expect(minutes(fromA.stopSeconds[G])).toBe(7);
    expect(minutes(fromA.stopSeconds[H])).toBe(12);
  });

  it('takes the next connection when leaving at a set time', () => {
    const next = travelTimes(day, STOP_POS[A], { leaveAt: day.windowStart });
    expect(next.departures).toBe(1);
    expect(next.stopSeconds[A]).toBe(0);
    // Leaving at 10:00 the best trip to H takes 22 min, waiting included (see above).
    expect(minutes(next.stopSeconds[H])).toBe(22);
    for (let s = 0; s < day.stopCount; s++)
      expect(next.stopSeconds[s]).toBeGreaterThanOrEqual(fromA.stopSeconds[s]);
  });

  it('leaves stops without service unreachable', () => {
    expect(fromA.stopSeconds[I]).toBe(Infinity);
  });

  it('reports metadata', () => {
    expect(fromA.computedInMs).toBeGreaterThanOrEqual(0);
    expect(fromA.origin).toEqual(STOP_POS[A]);
    expect(fromA.departures).toBeGreaterThan(0);
  });

  it('respects maxRounds', () => {
    const one = travelTimes(day, STOP_POS[A], { maxRounds: 1 });
    expect(one.stopSeconds[D]).toBe(360);
    expect(one.stopSeconds[G]).toBe(420); // U1 then walk, still one vehicle
    expect(one.stopSeconds[E]).toBe(Infinity);
    expect(one.stopSeconds[H]).toBe(Infinity);
    const zero = travelTimes(day, STOP_POS[A], { maxRounds: 0 });
    expect(zero.stopSeconds[A]).toBe(0);
    expect(zero.stopSeconds[B]).toBe(833); // 1 km walk, no vehicle
    expect(zero.stopSeconds[C]).toBe(Infinity);
  });

  it('adds the initial walk and respects maxInitialWalkSeconds', () => {
    const origin = { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon - 0.6 * KM_LON }; // 600 m west of A
    const r = travelTimes(day, origin);
    expect(r.stopSeconds[A]).toBe(500);
    expect(r.stopSeconds[B]).toBe(620);
    const short = travelTimes(day, origin, {
      maxInitialWalkSeconds: 300,
      maxFallbackWalkSeconds: 300,
    });
    expect(short.stopSeconds[A]).toBe(Infinity);
    expect(short.stopSeconds[D]).toBe(Infinity);
    // With no stop in range, the longer fallback walk (twice the limit) is allowed.
    const fallback = travelTimes(day, origin, { maxInitialWalkSeconds: 300 });
    expect(fallback.stopSeconds[A]).toBe(500);
  });

  it('counts walking from the origin to nearby stops even without a departure', () => {
    // Origin at I: nothing runs there, but I itself is a 0 s walk.
    const r = travelTimes(day, STOP_POS[I]);
    expect(r.stopSeconds[I]).toBe(0);
    expect(r.stopSeconds[A]).toBe(Infinity);
    expect(r.departures).toBe(0);
  });

  it('reaches fewer stops at night', () => {
    const night = loadTimetable(miniTimetable('night'));
    const n = travelTimes(night, STOP_POS[A]);
    const reached = (x: Float32Array) => x.filter((v) => v < Infinity).length;
    expect(reached(n.stopSeconds)).toBeLessThan(reached(fromA.stopSeconds));
    expect(n.stopSeconds[D]).toBe(360);
    expect(n.stopSeconds[H]).toBe(Infinity);
  });

  it('ignores departures outside the window', () => {
    const tt = miniTimetable('day');
    // Only a trip leaving A at 09:50 (before the window) and one at 12:10 (after it).
    tt.routes = [
      {
        name: 'X',
        mode: 'bus',
        stops: [A, D],
        trips: [
          [35400, 35520],
          [43800, 43920],
        ],
      },
    ];
    const r = travelTimes(loadTimetable(tt), STOP_POS[A]);
    expect(r.departures).toBe(0);
    expect(r.stopSeconds[D]).toBe(Infinity);
  });
});

describe('overtaking trips', () => {
  it('splits non-FIFO routes so an express that overtakes is still found', () => {
    const tt = miniTimetable('day');
    tt.routes = [
      {
        name: 'X',
        mode: 'bus',
        stops: [A, B, C],
        trips: [
          [36000, 36600, 37200], // slow: leaves first, arrives C 10:20
          [36060, 36120, 36180], // express: leaves a minute later, arrives C 10:03
        ],
      },
    ];
    const prepared = loadTimetable(tt);
    expect(prepared.routeCount).toBe(2);
    const r = travelTimes(prepared, STOP_POS[A]);
    expect(r.stopSeconds[C]).toBe(120);
  });
});

describe('travelTimes matches a brute-force reference', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`random network seed ${seed}`, () => {
      const raw = randomTimetable(seed);
      const tt = loadTimetable(raw);
      const rand = rng(seed * 7919);
      for (let o = 0; o < 4; o++) {
        const origin = raw.stops[Math.floor(rand() * raw.stops.length)];
        const got = travelTimes(tt, origin, { maxRounds: 50 });
        const want = referenceTravelTimes(raw, origin);
        for (let s = 0; s < raw.stops.length; s++) {
          if (want[s] === Infinity) expect(got.stopSeconds[s], `stop ${s}`).toBe(Infinity);
          else expect(Math.abs(got.stopSeconds[s] - want[s]), `stop ${s}`).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

describe('typical travel time', () => {
  const day = loadTimetable(miniTimetable('day'));
  const r = travelTimes(day, STOP_POS[A], { typical: true });

  it('is at least the best case and leaves best-case times unchanged', () => {
    const plain = travelTimes(day, STOP_POS[A]);
    for (let s = 0; s < plain.stopSeconds.length; s++) {
      expect(r.stopSeconds[s]).toBe(plain.stopSeconds[s]);
      if (plain.stopSeconds[s] < Infinity)
        expect(r.typicalSeconds![s]).toBeGreaterThanOrEqual(plain.stopSeconds[s]);
    }
  });

  it('adds half the headway for a single line', () => {
    // U1 every 10 min from A: on average 5 min wait plus 2 min to B.
    expect(minutes(r.typicalSeconds![B])).toBeCloseTo(7, 1);
    expect(r.typicalSeconds![A]).toBe(0);
  });

  it('is absent without the option', () => {
    expect(travelTimes(day, STOP_POS[A]).typicalSeconds).toBeUndefined();
  });

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`matches a brute-force reference, seed ${seed}`, () => {
      const raw = randomTimetable(seed);
      const tt = loadTimetable(raw);
      const rand = rng(seed * 104729);
      for (let o = 0; o < 3; o++) {
        const origin = raw.stops[Math.floor(rand() * raw.stops.length)];
        const got = travelTimes(tt, origin, {
          maxRounds: 50,
          typical: true,
          typicalHorizonSeconds: 1800,
        });
        const want = referenceTypical(raw, origin, 1800);
        for (let s = 0; s < raw.stops.length; s++) {
          if (want[s] === Infinity) expect(got.typicalSeconds![s], `stop ${s}`).toBe(Infinity);
          else
            expect(Math.abs(got.typicalSeconds![s] - want[s]), `stop ${s}`).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
