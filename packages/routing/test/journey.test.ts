import { describe, expect, it } from 'vitest';
import {
  departureAt,
  heatGrid,
  journeyTo,
  laterChange,
  laterStart,
  loadTimetable,
  rideTimes,
  travelTimes,
} from '../src';
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

  it("keeps that ride's two trips and times it across the change (S037)", () => {
    const j = journeyTo(tt, r, grid, pos[3].lat, pos[3].lon)!;
    const ride = j.legs[1];
    if (ride.type !== 'ride') throw new Error('no ride');
    expect(ride.parts?.map((p) => p.count)).toEqual([2, 2]);
    // On the first trip from Q at 10:15, at Z 10:30; on the next from Z 10:31, at Y 10:40.
    expect(rideTimes(tt, ride, H10)).toEqual({
      dep: [H10 + 900, H10 + 1860, H10 + 2400],
      arr: [H10 + 900, H10 + 1800, H10 + 2400],
    });
  });
});

describe('a change between two vehicles of one line (S037)', () => {
  // Bus 893 P–X–W goes on to W; another 893 X–Z leaves X a minute after the first gets there.
  const H10 = 10 * 3600;
  const pos = [
    STOP_POS[A],
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 2 * KM_LON },
    { lat: STOP_POS[A].lat + 3 * KM_LAT, lon: STOP_POS[A].lon + 2 * KM_LON },
    { lat: STOP_POS[A].lat, lon: STOP_POS[A].lon + 4 * KM_LON },
  ];
  const tt = loadTimetable({
    version: 1,
    window: 'day',
    serviceDate: '2026-10-14',
    windowStart: H10,
    windowEnd: H10 + 7200,
    feedVersion: 'fixture',
    stops: ['P', 'X', 'W', 'Z'].map((name, i) => ({ id: name, name, ...pos[i] })),
    routes: [
      { name: '893', mode: 'bus', stops: [0, 1, 2], trips: [[H10, H10 + 300, H10 + 900]] },
      { name: '893', mode: 'bus', stops: [1, 3], trips: [[H10 + 360, H10 + 600]] },
    ],
    transfers: [],
  });
  const r = travelTimes(tt, pos[0], { trackLegs: true, leaveAt: H10 });
  const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true });

  it('stays two rides, so the card says to change', () => {
    const j = journeyTo(tt, r, grid, pos[3].lat, pos[3].lon)!;
    const rides = j.legs.filter((l) => l.type === 'ride');
    expect(rides.map((l) => l.type === 'ride' && [l.name, l.stops, !!l.parts])).toEqual([
      ['893', [0, 1], false],
      ['893', [1, 3], false],
    ]);
    expect(j.transfers).toBe(1);
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

describe('laterChange (S038)', () => {
  // Tram M4 P–X–Y; bus 255 Q–Y–Z, Q a 5 min footpath from X. Off the tram at X (10:05) the
  // walk gets to Q for the bus at 10:10; the tram itself is at Y at 10:09, and the same bus
  // passes Y at 10:12. RAPTOR boards the bus at Q, its first stop where it can be caught.
  const H10 = 10 * 3600;
  const at = (east: number, north = 0) => ({
    lat: STOP_POS[A].lat + north * KM_LAT,
    lon: STOP_POS[A].lon + east * KM_LON,
  });
  const pos = [at(0), at(2), at(2.3), at(3), at(5)];
  const tt = loadTimetable({
    version: 1,
    window: 'day',
    serviceDate: '2026-10-14',
    windowStart: H10,
    windowEnd: H10 + 7200,
    feedVersion: 'fixture',
    stops: ['P', 'X', 'Q', 'Y', 'Z'].map((name, i) => ({ id: name, name, ...pos[i] })),
    routes: [
      { name: 'M4', mode: 'tram', stops: [0, 1, 3], trips: [[H10, H10 + 300, H10 + 540]] },
      { name: '255', mode: 'bus', stops: [2, 3, 4], trips: [[H10 + 600, H10 + 720, H10 + 1200]] },
    ],
    transfers: [
      { from: 1, to: 2, seconds: 300 },
      { from: 2, to: 1, seconds: 300 },
    ],
  });
  const r = travelTimes(tt, pos[0], { trackLegs: true, leaveAt: H10 });
  const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true });
  const shape = (j: {
    legs: ({ type: 'walk'; seconds: number } | { type: 'ride'; name: string; stops: number[] })[];
  }) =>
    j.legs.map((l) => (l.type === 'walk' ? `walk ${l.seconds}` : `${l.name} ${l.stops.join('')}`));

  it('stays on the tram to where it meets the same bus', () => {
    const found = journeyTo(tt, r, grid, pos[4].lat, pos[4].lon)!;
    // (The last walk is to the middle of the place's 50 m cell.)
    expect(shape(found)).toEqual(['M4 01', 'walk 300', '255 234', 'walk 17']);
    const j = laterChange(tt, found, H10);
    expect(shape(j)).toEqual(['M4 013', '255 34', 'walk 17']);
    expect(j.transfers).toBe(found.transfers);
    // The same bus, so the same arrival.
    const ride = j.legs[1];
    expect(ride.type === 'ride' && rideTimes(tt, ride, H10 + 540)!.arr.at(-1)).toBe(H10 + 1200);
  });

  it('keeps the walk when staying on misses the bus', () => {
    const late = loadTimetable({
      ...{
        version: 1,
        window: 'day',
        serviceDate: '2026-10-14',
        windowStart: H10,
        windowEnd: H10 + 7200,
        feedVersion: 'fixture',
        stops: ['P', 'X', 'Q', 'Y', 'Z'].map((name, i) => ({ id: name, name, ...pos[i] })),
      },
      routes: [
        // The tram is at Y only at 10:13, after the bus has left it.
        { name: 'M4', mode: 'tram', stops: [0, 1, 3], trips: [[H10, H10 + 300, H10 + 780]] },
        { name: '255', mode: 'bus', stops: [2, 3, 4], trips: [[H10 + 600, H10 + 720, H10 + 1200]] },
      ],
      transfers: [
        { from: 1, to: 2, seconds: 300 },
        { from: 2, to: 1, seconds: 300 },
      ],
    });
    const rl = travelTimes(late, pos[0], { trackLegs: true, leaveAt: H10 });
    const g = heatGrid(late, rl, { cellSizeM: 50, trackStops: true });
    const found = journeyTo(late, rl, g, pos[4].lat, pos[4].lon)!;
    expect(laterChange(late, found, H10)).toBe(found);
  });
});
