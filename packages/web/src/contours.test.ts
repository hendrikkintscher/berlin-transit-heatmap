import { describe, expect, it } from 'vitest';
import { contours, halve, outlines, traceLevel, traceLevels } from './contours';

/** Seconds growing with distance from the centre of a size x size grid, 60 s per cell. */
function cone(size: number) {
  const s = new Float32Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) s[y * size + x] = 60 * Math.hypot(x - c, y - c);
  return s;
}

describe('traceLevel', () => {
  it('traces one closed ring around a cone at the right distance', () => {
    const lines = traceLevel(cone(41), 41, 41, 10 * 60);
    expect(lines).toHaveLength(1);
    const ring = lines[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [x, y] of ring) expect(Math.hypot(x - 20, y - 20)).toBeCloseTo(10, 0);
  });

  it('treats unreachable cells as outside every level', () => {
    const s = cone(21);
    s[0] = Infinity;
    const lines = traceLevel(s, 21, 21, 5 * 60);
    expect(lines).toHaveLength(1);
  });

  it('leaves an open line where the level runs off the grid', () => {
    const s = new Float32Array(10 * 10);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) s[y * 10 + x] = x * 100;
    const lines = traceLevel(s, 10, 10, 450);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(10);
    for (const [x] of lines[0]) expect(x).toBeCloseTo(4.5);
  });
});

describe('contours', () => {
  it('returns one feature per level with lon/lat coordinates in the box', () => {
    const fc = contours(cone(101), 101, 101, [13, 52, 14, 53], [15, 30, 45]);
    expect(fc.features.map((f) => f.properties.min)).toEqual([15, 30, 45]);
    for (const f of fc.features)
      for (const [lon, lat] of f.geometry.coordinates) {
        expect(lon).toBeGreaterThan(13);
        expect(lon).toBeLessThan(14);
        expect(lat).toBeGreaterThan(52);
        expect(lat).toBeLessThan(53);
      }
  });
});

describe('traceLevels', () => {
  it('traces each level as traceLevel would', () => {
    const s = cone(41);
    const all = traceLevels(s, 41, 41, [300, 600, 900]);
    expect(all.map((l) => l.length)).toEqual([1, 1, 1]);
    expect(all[1]).toEqual(traceLevel(s, 41, 41, 600));
  });
});

describe('halve', () => {
  it('averages the reachable cells of each 2x2 block and trims an odd edge', () => {
    const s = Float32Array.from([10, 20, 1, 30, Infinity, 1, 1, 1, 1]);
    const h = halve(s, 3, 3, [0, 0, 3, 3]);
    expect([h.cols, h.rows]).toEqual([1, 1]);
    expect(h.seconds[0]).toBeCloseTo(20);
    expect(h.bbox).toEqual([0, 1, 2, 3]);
  });
});

describe('outlines', () => {
  it('finds the same rings as the full-resolution trace', () => {
    const fc = outlines(cone(201), 201, 201, [13, 52, 14, 53], 2, [30, 60]);
    expect(fc.features.map((f) => f.properties.min)).toEqual([30, 60]);
  });
});
