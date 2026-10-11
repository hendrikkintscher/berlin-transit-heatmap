import { describe, expect, it } from 'vitest';
import { blurSeconds, warpField } from './soften';

describe('blurSeconds', () => {
  it('smooths a spike, keeps constants and leaves unreachable cells alone', () => {
    const cols = 20;
    const rows = 20;
    const a = new Float32Array(cols * rows).fill(600);
    a[4 * cols + 4] = 0;
    a[0] = Infinity;
    const b = blurSeconds(a, cols, rows, 2);
    expect(b[4 * cols + 4]).toBeGreaterThan(400);
    expect(b[19 * cols + 19]).toBeCloseTo(600, 3);
    expect(b[0]).toBe(Infinity);
    // The unreachable corner does not drag its neighbour towards Infinity.
    expect(b[1]).toBeLessThanOrEqual(600);
  });
});

describe('warpField', () => {
  it('is deterministic, bounded and smooth', () => {
    const w1 = warpField(40, 30, 2.5, 9);
    const w2 = warpField(40, 30, 2.5, 9);
    expect([...w1.dx]).toEqual([...w2.dx]);
    let maxAbs = 0;
    let maxStep = 0;
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 40; c++) {
        const k = r * 40 + c;
        maxAbs = Math.max(maxAbs, Math.abs(w1.dx[k]), Math.abs(w1.dy[k]));
        if (c > 0) maxStep = Math.max(maxStep, Math.abs(w1.dx[k] - w1.dx[k - 1]));
      }
    }
    expect(maxAbs).toBeLessThanOrEqual(2.5);
    expect(maxAbs).toBeGreaterThan(0.5);
    expect(maxStep).toBeLessThan(1);
  });
});
