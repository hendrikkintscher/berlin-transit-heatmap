import { describe, expect, it } from 'vitest';
import { BlurScratch, blurSeconds, warpField } from './soften';

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

/** The blur as it was, column by column: the row-by-row version must match it exactly. */
function blurReference(seconds: Float32Array, cols: number, rows: number, radius: number) {
  const n = cols * rows;
  const out = new Float32Array(n);
  const tmp = new Float32Array(n);
  const line = (from: Float32Array, to: Float32Array, start: number, stride: number, n: number) => {
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < Math.min(radius, n); i++) {
      const v = from[start + i * stride]!;
      if (v < Infinity) {
        sum += v;
        cnt++;
      }
    }
    for (let i = 0; i < n; i++) {
      if (i + radius < n) {
        const v = from[start + (i + radius) * stride]!;
        if (v < Infinity) {
          sum += v;
          cnt++;
        }
      }
      if (i - radius - 1 >= 0) {
        const v = from[start + (i - radius - 1) * stride]!;
        if (v < Infinity) {
          sum -= v;
          cnt--;
        }
      }
      const k = start + i * stride;
      to[k] = from[k]! < Infinity && cnt > 0 ? sum / cnt : Infinity;
    }
  };
  let from = seconds;
  for (let p = 0; p < 2; p++) {
    for (let r = 0; r < rows; r++) line(from, tmp, r * cols, 1, cols);
    for (let c = 0; c < cols; c++) line(tmp, out, c, cols, rows);
    from = out;
  }
  return out;
}

describe('blurSeconds row by row', () => {
  it('gives exactly the column-by-column result, with and without scratch buffers', () => {
    const scratch = new BlurScratch();
    for (const [cols, rows, radius] of [
      [37, 23, 3],
      [5, 40, 6],
      [64, 3, 2],
    ] as const) {
      const a = new Float32Array(cols * rows);
      let x = 12345;
      for (let i = 0; i < a.length; i++) {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        a[i] = x % 7 === 0 ? Infinity : (x % 5400) + 0.25;
      }
      const want = [...blurReference(a, cols, rows, radius)];
      expect([...blurSeconds(a, cols, rows, radius)]).toEqual(want);
      expect([...blurSeconds(a, cols, rows, radius, 2, scratch)]).toEqual(want);
    }
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
