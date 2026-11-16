import { describe, expect, it } from 'vitest';
import { DEFAULT_BBOX, gridValueAt, heatGrid, loadTimetable, travelTimes } from '../src';
import { A, D, H, I, KM_LAT, KM_LON, miniTimetable, STOP_POS } from './fixture';

describe('heatGrid', () => {
  const tt = loadTimetable(miniTimetable('day'));
  const result = travelTimes(tt, STOP_POS[A]);
  const grid = heatGrid(tt, result);

  it('covers the default Berlin bbox with 250 m cells', () => {
    expect(grid.cellSizeM).toBe(250);
    expect(grid.cols).toBeGreaterThan(150);
    expect(grid.rows).toBeGreaterThan(150);
    expect(grid.seconds.length).toBe(grid.cols * grid.rows);
    const [w, s, e, n] = grid.bbox;
    expect(w).toBe(DEFAULT_BBOX[0]);
    expect(n).toBe(DEFAULT_BBOX[3]);
    expect(e).toBeGreaterThanOrEqual(DEFAULT_BBOX[2]);
    expect(s).toBeLessThanOrEqual(DEFAULT_BBOX[1]);
    // Cells are about 250 m square.
    expect(((e - w) / grid.cols) * 111_320 * Math.cos((52.505 * Math.PI) / 180)).toBeCloseTo(
      250,
      0,
    );
    expect(((n - s) / grid.rows) * 111_320).toBeCloseTo(250, 0);
  });

  it('is about zero at the origin and grows with walking distance', () => {
    const atOrigin = gridValueAt(grid, STOP_POS[A].lat, STOP_POS[A].lon);
    expect(atOrigin).toBeLessThan(200); // at most ~half a cell diagonal of walking
    const near = gridValueAt(grid, STOP_POS[A].lat + 0.5 * KM_LAT, STOP_POS[A].lon - 0.3 * KM_LON);
    expect(near).toBeGreaterThan(atOrigin);
  });

  it('adds the final walk to stop times', () => {
    const atH = gridValueAt(grid, STOP_POS[H].lat, STOP_POS[H].lon);
    expect(atH).toBeGreaterThanOrEqual(result.stopSeconds[H]);
    expect(atH).toBeLessThan(result.stopSeconds[H] + 200);
    const nearD = gridValueAt(grid, STOP_POS[D].lat + 0.5 * KM_LAT, STOP_POS[D].lon);
    expect(nearD).toBeGreaterThan(result.stopSeconds[D] + 300);
  });

  it('leaves cells far from any reached stop unreachable', () => {
    expect(gridValueAt(grid, STOP_POS[I].lat, STOP_POS[I].lon)).toBe(Infinity);
    expect(gridValueAt(grid, 52.4, 13.2)).toBe(Infinity);
    expect(gridValueAt(grid, 0, 0)).toBe(Infinity); // outside the grid
  });

  it('respects maxFinalWalkSeconds', () => {
    const tight = heatGrid(tt, { ...result, origin: undefined }, { maxFinalWalkSeconds: 120 });
    const reachable = (g: typeof grid) => g.seconds.filter((v) => v < Infinity).length;
    expect(reachable(tight)).toBeLessThan(reachable(grid));
    expect(gridValueAt(tight, STOP_POS[A].lat + 1 * KM_LAT, STOP_POS[A].lon)).toBe(Infinity);
  });

  it('honours cellSizeM and bbox', () => {
    const g = heatGrid(tt, result, { cellSizeM: 500, bbox: [13.38, 52.5, 13.48, 52.56] });
    expect(g.cols).toBe(Math.ceil(0.1 / (500 / (111_320 * Math.cos((52.53 * Math.PI) / 180)))));
    expect(g.rows).toBe(Math.ceil(0.06 / (500 / 111_320)));
    expect(g.seconds.some((v) => v < Infinity)).toBe(true);
  });
});

describe('heatGrid window', () => {
  it('matches the whole grid there without a footpath network, clipped at the edges', () => {
    const tt = loadTimetable(miniTimetable('day'));
    const result = travelTimes(tt, STOP_POS[A]);
    const bbox: [number, number, number, number] = [13.38, 52.5, 13.48, 52.56];
    const full = heatGrid(tt, result, { cellSizeM: 500, bbox });
    const part = heatGrid(tt, result, {
      cellSizeM: 500,
      bbox,
      window: { c0: -2, r0: 1, cols: 6, rows: 3 },
    });
    expect([part.cols, part.rows]).toEqual([4, 3]);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 4; x++)
        expect(part.seconds[y * 4 + x]).toBe(full.seconds[(1 + y) * full.cols + x]);
    expect(part.bbox[0]).toBe(full.bbox[0]);
    expect(part.bbox[3]).toBeCloseTo(full.bbox[3] - (full.bbox[3] - full.bbox[1]) / full.rows, 9);
  });
});
