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
  buffers(n: number): [Float32Array, Float32Array] {
    if (this.out.length < n) {
      this.out = new Float32Array(n);
      this.tmp = new Float32Array(n);
    }
    return [this.out.subarray(0, n), this.tmp.subarray(0, n)];
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
  const line = (
    from: Float32Array,
    to: Float32Array,
    start: number,
    stride: number,
    n: number,
  ): void => {
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < Math.min(radius, n); i++) {
      const v = from[start + i * stride];
      if (v < Infinity) {
        sum += v;
        cnt++;
      }
    }
    for (let i = 0; i < n; i++) {
      const add = i + radius;
      if (add < n) {
        const v = from[start + add * stride];
        if (v < Infinity) {
          sum += v;
          cnt++;
        }
      }
      const drop = i - radius - 1;
      if (drop >= 0) {
        const v = from[start + drop * stride];
        if (v < Infinity) {
          sum -= v;
          cnt--;
        }
      }
      const k = start + i * stride;
      to[k] = from[k] < Infinity && cnt > 0 ? sum / cnt : Infinity;
    }
  };
  // Rows into tmp, then columns back into out (each pass reads only what the last wrote).
  let from = seconds;
  if (passes < 1) out.set(seconds);
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < rows; r++) line(from, tmp, r * cols, 1, cols);
    for (let c = 0; c < cols; c++) line(tmp, out, c, cols, rows);
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
