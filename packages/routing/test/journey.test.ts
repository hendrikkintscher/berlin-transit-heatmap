import { describe, expect, it } from 'vitest';
import { departureAt, heatGrid, journeyTo, loadTimetable, travelTimes } from '../src';
import { A, C, G, H, I, KM_LAT, KM_LON, miniTimetable, STOP_POS } from './fixture';

describe('journeyTo', () => {
  const tt = loadTimetable(miniTimetable('day'));
  const r = travelTimes(tt, STOP_POS[A], { trackLegs: true });
  const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true });

  it('rebuilds U-Bahn, transfer walk and tram to a cell next to H', () => {
    const j = journeyTo(tt, r, grid, STOP_POS[H].lat + 0.1 * KM_LAT, STOP_POS[H].lon)!;
    const kinds = j.legs.map((l) => (l.type === 'ride' ? l.name : 'walk'));
    expect(kinds).toEqual(['U1', 'walk', 'M1', 'walk']);
    const [u1, transfer, m1, last] = j.legs;
    expect(u1.type === 'ride' && [u1.from, u1.to]).toEqual([A, C]);
    expect(transfer.type === 'walk' && transfer.seconds).toBe(180);
    expect(m1.type === 'ride' && [m1.from, m1.to, m1.stops]).toEqual([G, H, [G, H]]);
    expect(last.type === 'walk' && last.seconds).toBeGreaterThan(60);
    expect(j.transfers).toBe(1);
  });

  it('is a plain walk next to the origin', () => {
    const j = journeyTo(tt, r, grid, STOP_POS[A].lat + 0.05 * KM_LAT, STOP_POS[A].lon)!;
    expect(j.legs).toHaveLength(1);
    expect(j.legs[0].type).toBe('walk');
    expect(j.transfers).toBe(0);
  });

  it('is null outside the grid or where nothing is reachable', () => {
    expect(journeyTo(tt, r, grid, 0, 0)).toBeNull();
    expect(journeyTo(tt, r, grid, STOP_POS[A].lat + 9 * KM_LAT, STOP_POS[A].lon)).toBeNull();
  });

  it('finds when the boarded vehicle leaves', () => {
    const j = journeyTo(tt, r, grid, STOP_POS[H].lat + 0.1 * KM_LAT, STOP_POS[H].lon)!;
    const u1 = j.legs[0];
    if (u1.type !== 'ride') throw new Error('expected a ride');
    // U1 leaves A every 10 minutes from 10:00.
    expect(departureAt(tt, u1.route, u1.fromPos, 10 * 3600 + 1)).toBe(10 * 3600 + 600);
    expect(departureAt(tt, u1.route, u1.fromPos, 10 * 3600)).toBe(10 * 3600);
    expect(departureAt(tt, u1.route, u1.fromPos, 99 * 3600)).toBeNull();
  });
});

describe('journeyTo leaving at one moment', () => {
  // P is at the origin and Q 600 m away. A bus P -> Q gets to Q before walking does, but
  // the train from Q leaves late enough for the walk: the journey is walk + train.
  const H10 = 10 * 3600;
  const pos = [
    STOP_POS[A],
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 0.6 * KM_LON },
    STOP_POS[H],
    STOP_POS[I],
  ];
  const tt = loadTimetable({
    version: 1,
    window: 'day',
    serviceDate: '2026-10-14',
    windowStart: H10,
    windowEnd: H10 + 7200,
    feedVersion: 'fixture',
    stops: ['P', 'Q', 'Z', 'Y'].map((name, i) => ({ id: name, name, ...pos[i] })),
    routes: [
      { name: '100', mode: 'bus', stops: [0, 1], trips: [[H10 + 60, H10 + 180]] },
      { name: 'S1', mode: 'sbahn', stops: [1, 2], trips: [[H10 + 900, H10 + 1800]] },
      // The Ring changes trips on the way; riders stay on board.
      { name: 'S1', mode: 'sbahn', stops: [2, 3], trips: [[H10 + 1860, H10 + 2400]] },
    ],
    transfers: [],
  });
  const r = travelTimes(tt, pos[0], { trackLegs: true, leaveAt: H10 });
  const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true });

  it('shows no ride the journey did not need', () => {
    const j = journeyTo(tt, r, grid, pos[2].lat, pos[2].lon)!;
    expect(j.legs.map((l) => (l.type === 'ride' ? l.name : 'walk'))).toEqual([
      'walk',
      'S1',
      'walk',
    ]);
    expect(j.transfers).toBe(0);
  });

  it("keeps a stop's own fastest way for trips that end there", () => {
    const j = journeyTo(tt, r, grid, pos[1].lat, pos[1].lon)!;
    expect(j.legs.map((l) => (l.type === 'ride' ? l.name : 'walk'))).toEqual(['100', 'walk']);
  });

  it('shows a line that changes trips at a stop as one ride', () => {
    const j = journeyTo(tt, r, grid, pos[3].lat, pos[3].lon)!;
    const ride = j.legs[1];
    expect(ride.type === 'ride' && [ride.name, ride.stops]).toEqual(['S1', [1, 2, 3]]);
    expect(j.transfers).toBe(0);
  });
});
