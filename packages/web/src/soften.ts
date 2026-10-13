// Visual softening for the heatmap image. Straight-line walking from each stop makes
// perfect circles; these helpers blur the travel-time field a little and wobble where
// it is sampled, so band edges read as organic shapes. The tap readout keeps using the
// raw grid, so displayed minutes are unaffected.

/**
 * Two buffers kept for blurSeconds between calls, so blurring a map allocates nothing; a
 * blur's result lives in them until the next blur with the same scratch.
 */
export class BlurScratch {
  private out = new Float32Array(0);
  private tmp = new Float32Array(0);
  private sum = new Float64Array(0);
  private cnt = new Int32Array(0);
  buffers(n: number): [Float32Array, Float32Array] {
    if (this.out.length < n) {
      this.out = new Float32Array(n);
      this.tmp = new Float32Array(n);
    }
    return [this.out.subarray(0, n), this.tmp.subarray(0, n)];
  }
  /** Running sums and counts for `cols` columns, zeroed. */
  sums(cols: number): [Float64Array, Int32Array] {
    if (this.sum.length < cols) {
      this.sum = new Float64Array(cols);
      this.cnt = new Int32Array(cols);
    }
    const sum = this.sum.subarray(0, cols);
    const cnt = this.cnt.subarray(0, cols);
    sum.fill(0);
    cnt.fill(0);
    return [sum, cnt];
  }
}

/**
 * Separable box blur over the finite values (two passes approximate a Gaussian).
 * Unreachable cells stay unreachable and do not pull their neighbours up. With `scratch`
 * the result is written into its buffers instead of new arrays.
 */
export function blurSeconds(
  seconds: Float32Array,
  cols: number,
  rows: number,
  radius: number,
  passes = 2,
  scratch?: BlurScratch,
): Float32Array {
  const n = cols * rows;
  const [out, tmp] = scratch ? scratch.buffers(n) : [new Float32Array(n), new Float32Array(n)];
  const rowLine = (from: Float32Array, to: Float32Array, start: number): void => {
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < Math.min(radius, cols); i++) {
      const v = from[start + i]!;
      if (v < Infinity) {
        sum += v;
        cnt++;
      }
    }
    for (let i = 0; i < cols; i++) {
      const add = i + radius;
      if (add < cols) {
        const v = from[start + add]!;
        if (v < Infinity) {
          sum += v;
          cnt++;
        }
      }
      const drop = i - radius - 1;
      if (drop >= 0) {
        const v = from[start + drop]!;
        if (v < Infinity) {
          sum -= v;
          cnt--;
        }
      }
      const k = start + i;
      to[k] = from[k]! < Infinity && cnt > 0 ? sum / cnt : Infinity;
    }
  };
  /**
   * The same window down every column, walked row by row (running sums per column), so
   * memory is read in order: the same sums as column by column, about twice as fast.
   */
  const columns = (from: Float32Array, to: Float32Array): void => {
    const [sum, cnt] = scratch
      ? scratch.sums(cols)
      : [new Float64Array(cols), new Int32Array(cols)];
    const take = (r: number, sign: 1 | -1): void => {
      const o = r * cols;
      for (let c = 0; c < cols; c++) {
        const v = from[o + c]!;
        if (v < Infinity) {
          sum[c] += sign * v;
          cnt[c] += sign;
        }
      }
    };
    for (let r = 0; r < Math.min(radius, rows); r++) take(r, 1);
    for (let r = 0; r < rows; r++) {
      if (r + radius < rows) take(r + radius, 1);
      if (r - radius - 1 >= 0) take(r - radius - 1, -1);
      const o = r * cols;
      for (let c = 0; c < cols; c++) {
        const k = o + c;
        to[k] = from[k]! < Infinity && cnt[c]! > 0 ? sum[c]! / cnt[c]! : Infinity;
      }
    }
  };
  // Rows into tmp, then columns back into out (each pass reads only what the last wrote).
  let from = seconds;
  if (passes < 1) out.set(seconds);
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < rows; r++) rowLine(from, tmp, r * cols);
    columns(tmp, out);
    from = out;
  }
  return out;
}

/** Deterministic hash of a lattice point to [-1, 1]. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

/** Smooth value noise in [-1, 1] with lattice spacing 1. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Per-cell sampling offsets (in cells) from two octaves of value noise:
 * `wavelength` cells between bumps, up to about `amplitude` cells of shift.
 */
export function warpField(
  cols: number,
  rows: number,
  amplitude: number,
  wavelength: number,
): { dx: Float32Array; dy: Float32Array } {
  const dx = new Float32Array(cols * rows);
  const dy = new Float32Array(cols * rows);
  const f = 1 / wavelength;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const x = c * f;
      const y = r * f;
      dx[k] = amplitude * (0.7 * valueNoise(x, y, 1) + 0.3 * valueNoise(2.7 * x, 2.7 * y, 3));
      dy[k] = amplitude * (0.7 * valueNoise(x, y, 2) + 0.3 * valueNoise(2.7 * x, 2.7 * y, 4));
    }
  }
  return { dx, dy };
}
