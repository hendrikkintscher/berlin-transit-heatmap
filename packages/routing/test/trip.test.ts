import { describe, expect, it } from 'vitest';
import {
  loadTimetable,
  reverseTimetable,
  travelTimes,
  tripBetween,
  walksToStops,
  type Journey,
  type PreparedTimetable,
  type Timetable,
} from '../src';
import { A, D, H, KM_LAT, KM_LON, miniTimetable, STOP_POS } from './fixture';

const H10 = 10 * 3600;
const bothWays = (raw: Timetable) => ({
  fwd: loadTimetable(raw),
  back: loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600)),
});
const rides = (tt: PreparedTimetable, j: Journey) =>
  j.legs.map((l) =>
    l.type === 'ride' ? `${l.name} ${tt.stops[l.from].name}-${tt.stops[l.to].name}` : 'walk',
  );

describe('tripBetween', () => {
  const { fwd, back } = bothWays(miniTimetable('day'));
  const near = (s: number) => ({ lat: STOP_POS[s].lat + 0.1 * KM_LAT, lon: STOP_POS[s].lon });

  it('arriving by when a trip arrives gives that trip again', () => {
    const x = tripBetween(fwd, back, near(A), near(H), { leave: H10 + 30 })!;
    expect(rides(fwd, x.journey)).toEqual(['walk', 'U1 A-C', 'walk', 'M1 G-H', 'walk']);
    expect(tripBetween(fwd, back, near(A), near(H), { arrive: x.arrive })).toEqual(x);
    const span = { leave: x.leave, arrive: x.arrive };
    expect(tripBetween(fwd, back, near(A), near(H), span)).toEqual(x);
  });

  it('leaving when a trip leaves gives that trip again', () => {
    const x = tripBetween(fwd, back, near(D), near(A), { arrive: H10 + 3600 })!;
    expect(tripBetween(fwd, back, near(D), near(A), { leave: x.leave })).toEqual(x);
    const span = { leave: x.leave, arrive: x.arrive };
    expect(tripBetween(fwd, back, near(D), near(A), span)).toEqual(x);
    expect(x.arrive).toBeLessThanOrEqual(H10 + 3600);
  });

  it('leaves as late as still arrives as early', () => {
    // U1 every 10 minutes, the tram every 15: leaving at 10:00:30, the tram at 10:18 is
    // reached with the U1 of 10:10 as well as of 10:00.
    const x = tripBetween(fwd, back, near(A), near(H), { leave: H10 + 30 })!;
    const u1 = x.journey.legs.find((l) => l.type === 'ride')!;
    expect(u1.type === 'ride' && u1.from).toBe(A);
    expect(x.leave).toBeGreaterThan(H10 + 30);
  });

  it('is null out of reach', () => {
    expect(tripBetween(fwd, back, near(A), { lat: 0, lon: 0 }, { leave: H10 })).toBeNull();
  });

  it('comes out the same with the walks at either end given', () => {
    const fromWalks = walksToStops(fwd, near(A));
    const toWalks = walksToStops(fwd, near(H));
    for (const at of [{ leave: H10 + 30 }, { arrive: H10 + 2400 }]) {
      const x = tripBetween(fwd, back, near(A), near(H), at);
      expect(tripBetween(fwd, back, near(A), near(H), at, { fromWalks, toWalks })).toEqual(x);
    }
  });

  it('comes out the same with a bound on the arrival, too tight or not', () => {
    const x = tripBetween(fwd, back, near(A), near(H), { leave: H10 + 30 })!;
    for (const arriveByHint of [x.arrive, x.arrive + 900, x.arrive - 600, H10])
      expect(
        tripBetween(fwd, back, near(A), near(H), { leave: H10 + 30 }, { arriveByHint }),
      ).toEqual(x);
  });

  it('a search with its walks given is the same as one walking them', () => {
    const o = { leaveAt: H10 + 30, trackLegs: true };
    const given = travelTimes(fwd, near(A), { ...o, accessSeconds: walksToStops(fwd, near(A)) });
    const walked = travelTimes(fwd, near(A), o);
    expect([...given.stopSeconds]).toEqual([...walked.stopSeconds]);
    expect([...given.legs!.kind]).toEqual([...walked.legs!.kind]);
  });
});

describe('tripBetween with a change or none', () => {
  // A bus P -> Z leaves at 10:00 and arrives at 10:40; a bus P -> Q at 10:10 meets a
  // train Q -> Z that arrives at 10:40 too.
  const pos = [
    STOP_POS[A],
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 3 * KM_LON },
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 6 * KM_LON },
  ];
  const { fwd, back } = bothWays({
    version: 1,
    window: 'day',
    serviceDate: '2026-10-14',
    windowStart: H10,
    windowEnd: H10 + 3600,
    feedVersion: 'fixture',
    stops: ['P', 'Q', 'Z'].map((name, i) => ({ id: name, name, ...pos[i] })),
    routes: [
      { name: '100', mode: 'bus', stops: [0, 2], trips: [[H10, H10 + 2400]] },
      { name: '200', mode: 'bus', stops: [0, 1], trips: [[H10 + 600, H10 + 1200]] },
      { name: 'S1', mode: 'sbahn', stops: [1, 2], trips: [[H10 + 1500, H10 + 2400]] },
    ],
    transfers: [],
  });
  const [p, z] = [pos[0], pos[2]];

  it('leaving, takes the fewest rides of the trips arriving earliest', () => {
    const x = tripBetween(fwd, back, p, z, { leave: H10 - 60 })!;
    expect(rides(fwd, x.journey)).toEqual(['100 P-Z']);
    expect(tripBetween(fwd, back, p, z, { leave: x.leave, arrive: x.arrive })).toEqual(x);
  });

  it('arriving, leaves latest, with a change if need be', () => {
    const x = tripBetween(fwd, back, p, z, { arrive: H10 + 2400 })!;
    expect(rides(fwd, x.journey)).toEqual(['200 P-Q', 'S1 Q-Z']);
    expect(x.leave).toBe(H10 + 600);
    expect(tripBetween(fwd, back, p, z, { leave: x.leave, arrive: x.arrive })).toEqual(x);
    expect(tripBetween(fwd, back, p, z, { leave: x.leave })).toEqual(x);
  });
});

describe('footpaths at both ends of a trip', () => {
  // P at the start, its other platform Q 2 km away by the map (too far to walk to) but a
  // 60 s footpath from P; the train leaves from Q. Leaving and arriving find the same trip.
  const pos = [
    STOP_POS[A],
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 2 * KM_LON },
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 8 * KM_LON },
    { lat: STOP_POS[A].lat + 2 * KM_LAT, lon: STOP_POS[A].lon + 8 * KM_LON },
  ];
  const raw: Timetable = {
    version: 1,
    window: 'day',
    serviceDate: '2026-10-14',
    windowStart: H10,
    windowEnd: H10 + 3600,
    feedVersion: 'fixture',
    stops: ['P', 'Q', 'Z', 'Y'].map((name, i) => ({ id: name, name, ...pos[i] })),
    routes: [{ name: 'S1', mode: 'sbahn', stops: [1, 2], trips: [[H10 + 600, H10 + 1200]] }],
    transfers: [
      { from: 0, to: 1, seconds: 60 },
      { from: 1, to: 0, seconds: 60 },
      { from: 2, to: 3, seconds: 60 },
      { from: 3, to: 2, seconds: 60 },
    ],
  };
  const { fwd, back } = bothWays(raw);
  const start = { lat: pos[0].lat, lon: pos[0].lon + 0.05 * KM_LON };
  const end = { lat: pos[3].lat, lon: pos[3].lon };

  it('a footpath from the stop walked to comes before the first ride, as after the last', () => {
    const r = travelTimes(fwd, start, { trackLegs: true, leaveAt: H10 });
    expect(r.stopSeconds[1]).toBeLessThan(600);
    const x = tripBetween(fwd, back, start, end, { leave: H10 })!;
    expect(rides(fwd, x.journey)).toEqual(['walk', 'S1 Q-Z', 'walk']);
    expect(x.arrive).toBeLessThan(H10 + 1400);
    expect(tripBetween(fwd, back, start, end, { arrive: x.arrive })).toEqual(x);
  });

  it('range scans keep leaving footpaths out', () => {
    const r = travelTimes(fwd, start, {});
    expect(r.stopSeconds[1]).toBe(Infinity);
  });
});
