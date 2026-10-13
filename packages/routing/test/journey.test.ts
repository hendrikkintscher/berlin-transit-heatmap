import { describe, expect, it } from 'vitest';
import { departureAt, heatGrid, journeyTo, laterStart, loadTimetable, travelTimes } from '../src';
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

describe('laterStart', () => {
  // From P: tram M1 from F (600 m) gets to X at 10:20, bus 200 from N (100 m) at 10:24;
  // both catch the S1 at 10:30. RAPTOR keeps the tram (earlier at X); the bus walks less.
  const H10 = 10 * 3600;
  const p = STOP_POS[A];
  const pos = [
    p,
    { lat: p.lat, lon: p.lon + 0.6 * KM_LON },
    { lat: p.lat + 0.1 * KM_LAT, lon: p.lon },
    { lat: p.lat + 4 * KM_LAT, lon: p.lon },
    { lat: p.lat + 8 * KM_LAT, lon: p.lon },
  ];
  const timetable = (busArrives: number) =>
    loadTimetable({
      version: 1,
      window: 'day',
      serviceDate: '2026-10-14',
      windowStart: H10,
      windowEnd: H10 + 7200,
      feedVersion: 'fixture',
      stops: ['P', 'F', 'N', 'X', 'Z'].map((name, i) => ({ id: name, name, ...pos[i] })),
      routes: [
        { name: 'M1', mode: 'tram', stops: [1, 3], trips: [[H10 + 660, H10 + 1200]] },
        { name: '200', mode: 'bus', stops: [2, 3], trips: [[H10 + 780, H10 + busArrives]] },
        { name: 'S1', mode: 'sbahn', stops: [3, 4], trips: [[H10 + 1800, H10 + 2700]] },
      ],
      transfers: [],
    });
  const names = (j: { legs: { type: string; name?: string }[] }) =>
    j.legs.map((l) => (l.type === 'ride' ? l.name : 'walk'));

  it('takes the later bus from the nearer stop when it catches the same train', () => {
    const tt = timetable(1440);
    const r = travelTimes(tt, pos[0], { trackLegs: true, leaveAt: H10 });
    const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true });
    const j = journeyTo(tt, r, grid, pos[4].lat, pos[4].lon)!;
    expect(names(j)).toEqual(['walk', 'M1', 'S1', 'walk']);
    const later = laterStart(tt, j, r.legs!.rounds!.access, H10);
    expect(names(later)).toEqual(['walk', '200', 'S1', 'walk']);
    expect(later.legs[0].type === 'walk' && later.legs[0].seconds).toBeLessThan(
      j.legs[0].type === 'walk' ? j.legs[0].seconds : 0,
    );
    expect(later.transfers).toBe(1);
  });

  it('keeps the journey when the other way misses the train', () => {
    const tt = timetable(1860);
    const r = travelTimes(tt, pos[0], { trackLegs: true, leaveAt: H10 });
    const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true });
    const j = journeyTo(tt, r, grid, pos[4].lat, pos[4].lon)!;
    expect(laterStart(tt, j, r.legs!.rounds!.access, H10)).toBe(j);
  });
});
