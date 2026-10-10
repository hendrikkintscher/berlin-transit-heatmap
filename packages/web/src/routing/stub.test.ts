import { describe, expect, it } from 'vitest';
import { demoTimetable } from '../demo-data';
import { gridToGeoJSON, heatGrid, loadTimetable, travelTimes } from '.';

describe('routing stub', () => {
  it('produces a heat grid with 5-minute bands growing away from the origin', () => {
    const tt = loadTimetable(demoTimetable('day'));
    const result = travelTimes(tt, { lat: 52.5219, lon: 13.4132 });
    const grid = heatGrid(tt, result);
    const fc = gridToGeoJSON(grid);
    expect(fc.features.length).toBeGreaterThan(1000);
    const bands = fc.features.map((f) => f.properties!.band as number);
    expect(Math.min(...bands)).toBe(0);
    expect(Math.max(...bands)).toBeGreaterThan(6);
  });
});
