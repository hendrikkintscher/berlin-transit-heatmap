import { describe, expect, it } from 'vitest';
import { departureAt, heatGrid, journeyTo, loadTimetable, travelTimes } from '../src';
import { A, C, G, H, KM_LAT, miniTimetable, STOP_POS } from './fixture';

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
