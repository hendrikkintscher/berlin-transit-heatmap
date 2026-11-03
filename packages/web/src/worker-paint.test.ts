import type { HeatGrid } from '@berlin-transit-heatmap/routing';
import { describe, expect, it } from 'vitest';
import { MEET_GREY } from './colors';
import { meetFields, paintShown } from './worker-paint';

const grey = [1, 3, 5].map((o) => parseInt(MEET_GREY.slice(o, o + 2), 16));

/** A grid of `cols` x `rows` cells over a small part of Berlin, with these times. */
function gridOf(cols: number, rows: number, seconds: Float32Array): HeatGrid {
  return {
    cellSizeM: 50,
    bbox: [13.3, 52.5, 13.3 + cols * 0.0007, 52.5 + rows * 0.00045],
    cols,
    rows,
    seconds,
  } as HeatGrid;
}

describe('meetFields (S017)', () => {
  it('averages everyone and keeps unreachable places unreachable', () => {
    const a = new Float32Array([600, 1200, Infinity, 0]);
    const b = new Float32Array([1200, 1200, 600, 0]);
    const { avg } = meetFields([a, b], 2, 2);
    expect([...avg]).toEqual([900, 1200, Infinity, 0]);
  });

  it('keeps the gap between slowest and quickest on half the cells each way', () => {
    const cols = 6;
    const rows = 4;
    const a = new Float32Array(cols * rows).fill(600);
    const b = new Float32Array(cols * rows).fill(900);
    const { fade } = meetFields([a, b, a], cols, rows);
    expect(fade.cols).toBe(3);
    expect(fade.rows).toBe(2);
    for (const g of fade.gap) expect(g).toBeCloseTo(300);
  });

  it('rounds an odd grid up', () => {
    const { fade } = meetFields([new Float32Array(15), new Float32Array(15)], 5, 3);
    expect([fade.cols, fade.rows]).toEqual([3, 2]);
  });
});

describe('paintShown for a meeting point (S017)', () => {
  const cols = 40;
  const rows = 40;
  const paintMeet = (gapS: number) => {
    const a = new Float32Array(cols * rows).fill(1200);
    const b = new Float32Array(cols * rows).fill(1200 + gapS);
    const meet = meetFields([a, b], cols, rows);
    const grid = gridOf(cols, rows, b);
    const base = 1200 + gapS / 2;
    return paintShown({ id: 1, grid, offset: -base, meet });
  };
  const middle = (img: { width: number; height: number; rgba: Uint8ClampedArray }) => {
    const o = ((img.height >> 1) * img.width + (img.width >> 1)) * 4;
    return [...img.rgba.subarray(o, o + 4)];
  };

  it('paints the best place green where the trips are about even', () => {
    expect(middle(paintMeet(120))).toEqual([15, 122, 82, 255]);
  });

  it('turns fully grey from a 20 minute gap', () => {
    expect(middle(paintMeet(25 * 60))).toEqual([...grey, 255]);
  });

  it('is part way grey at a 14 minute gap', () => {
    const [r, g, b] = middle(paintMeet(14 * 60));
    expect(r).toBeGreaterThan(15);
    expect(r).toBeLessThan(grey[0]);
    expect(g).toBeGreaterThan(122);
    expect(b).toBeGreaterThan(82);
  });

  it('paints "Bis N Min." from the slowest times, not the average', () => {
    // On average 25 min, but one person needs 40: not within 30 minutes.
    const a = new Float32Array(cols * rows).fill(600);
    const b = new Float32Array(cols * rows).fill(2400);
    const meet = meetFields([a, b], cols, rows);
    const img = paintShown({ id: 1, grid: gridOf(cols, rows, b), offset: -1500, meet }, 30);
    // Nothing within reach: one pixel of the full veil.
    expect(img.width).toBe(1);
    expect(img.rgba[3]).toBeGreaterThan(0);
  });
});
