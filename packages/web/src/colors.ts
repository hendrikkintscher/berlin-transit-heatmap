// Travel-time colour scale. Bands are 5 minutes up to 20, 2.5 minutes from 20 to 50
// (where most of the city sits, so that range gets the most colour depth), then
// widen again. Hues run green (fast) -> yellow -> red -> purple -> navy (slow).

/** Lower band edges in minutes; the last band is open-ended. */
export const BAND_EDGES_MIN = [
  0, 5, 10, 15, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 55, 60, 75, 90, 120,
];
export const BAND_COUNT = BAND_EDGES_MIN.length;
export const MAX_BAND = BAND_COUNT - 1;

// Anchor colours: 0–20 greens, 20–50 yellow→purple (12 steps), 50+ blues to navy, 120+ grey.
const LOW = ['#0f7a52', '#38a35a', '#7cc248', '#c3dc3a'];
const MID_ANCHORS = ['#ffe83d', '#fbb02d', '#f2702e', '#d93a4a', '#a92070', '#702088'];
const HIGH = ['#4b3a9f', '#2f58ad', '#264a85', '#1d315c', '#151c36', '#5b5d6b'];

type Lab = [number, number, number];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toLin = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const fromLin = (x: number) => {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

/** sRGB hex -> OKLab. */
export function oklab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return '#' + rgb.map((x) => fromLin(x).toString(16).padStart(2, '0')).join('');
}

/** n colours spread evenly (in OKLab) along the anchor polyline, ends included. */
function ramp(anchors: string[], n: number): string[] {
  const labs = anchors.map(oklab);
  return Array.from({ length: n }, (_, k) => {
    const t = (k / (n - 1)) * (labs.length - 1);
    const i = Math.min(Math.floor(t), labs.length - 2);
    const f = t - i;
    const [a, b] = [labs[i], labs[i + 1]];
    return labToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  });
}

export const BAND_COLORS: string[] = [...LOW, ...ramp(MID_ANCHORS, 12), ...HIGH];

/** Band index for a travel time in seconds (Infinity -> -1). */
export function bandOf(seconds: number): number {
  if (!(seconds < Infinity)) return -1;
  const min = seconds / 60;
  let b = 0;
  while (b < MAX_BAND && min >= BAND_EDGES_MIN[b + 1]) b++;
  return b;
}

export function bandColor(band: number): string {
  return BAND_COLORS[Math.max(0, Math.min(band, MAX_BAND))];
}

export function bandLabel(band: number): string {
  const lo = BAND_EDGES_MIN[band];
  return band >= MAX_BAND ? `${lo}+` : `${lo}–${BAND_EDGES_MIN[band + 1]}`;
}

/**
 * RGBA lookup indexed by whole seconds (clamped to the last entry); alpha 0 = unreachable.
 * With `featherSeconds`, colours blend smoothly across each band edge over that many
 * seconds either side, so edges look soft instead of cut.
 */
export function colorLut(
  featherSeconds = 0,
  maxSeconds = BAND_EDGES_MIN[MAX_BAND] * 60,
): Uint8Array {
  const lut = new Uint8Array((maxSeconds + 1) * 4);
  const rgb = BAND_COLORS.map(hexToRgb);
  for (let s = 0; s <= maxSeconds; s++) {
    const b = bandOf(s);
    let col = rgb[b];
    if (featherSeconds > 0) {
      // Distance to the nearest edge decides how much of the neighbour band shows.
      const lo = BAND_EDGES_MIN[b] * 60;
      const hi = b < MAX_BAND ? BAND_EDGES_MIN[b + 1] * 60 : Infinity;
      const w = Math.min(featherSeconds, (hi - lo) / 2);
      let other = -1;
      let t = 0;
      if (s - lo < w && b > 0) {
        other = b - 1;
        t = 0.5 - (s - lo) / (2 * w);
      } else if (hi - s < w) {
        other = b + 1;
        t = 0.5 - (hi - s) / (2 * w);
      }
      if (other >= 0 && t > 0) {
        const o = rgb[other];
        // t runs from 0 inside the band to 0.5 at the edge, where both sides meet halfway.
        col = [0, 1, 2].map((i) => Math.round(col[i] + (o[i] - col[i]) * t)) as [
          number,
          number,
          number,
        ];
      }
    }
    lut.set([col[0], col[1], col[2], 255], s * 4);
  }
  return lut;
}

// Difference map (comparing two times): how many minutes longer the trip takes at the
// second time. Teals = faster, a light neutral around zero, warm to purple = slower.

/** Lower band edges in minutes of difference; the first and last bands are open-ended. */
export const DIFF_EDGES_MIN = [-Infinity, -20, -10, -5, -2, 2, 5, 10, 20, 30];
export const DIFF_COLORS = [
  '#0b5d63',
  '#24908a',
  '#6cc1b2',
  '#b9e2d6',
  '#efece6',
  '#fcd28a',
  '#f59e4c',
  '#e2583b',
  '#b8294f',
  '#6c1a72',
];
/** Differences are clamped to this range before colouring, in seconds. */
export const DIFF_MIN_S = -40 * 60;
export const DIFF_MAX_S = 60 * 60;

/** Band index for a difference in seconds. */
export function diffBandOf(seconds: number): number {
  const min = seconds / 60;
  let b = 0;
  while (b < DIFF_EDGES_MIN.length - 1 && min >= DIFF_EDGES_MIN[b + 1]) b++;
  return b;
}

/** RGBA lookup for differences, indexed by (seconds - DIFF_MIN_S). */
export function diffLut(): Uint8Array {
  const n = DIFF_MAX_S - DIFF_MIN_S + 1;
  const lut = new Uint8Array(n * 4);
  const rgb = DIFF_COLORS.map(hexToRgb);
  for (let i = 0; i < n; i++) {
    const c = rgb[diffBandOf(i + DIFF_MIN_S)];
    lut.set([c[0], c[1], c[2], 255], i * 4);
  }
  return lut;
}

// Home map ("Bis wann komme ich heim?"): the last fast connection home, as minutes before
// 4 Uhr. Green = all night, then later to earlier through yellow, red and purple to navy.

/**
 * Lower band edges in minutes before 4 Uhr: from 2 Uhr (a connection that late means the
 * night network carries on: all night), 1, 0:30, 0, 23:30, 23, earlier.
 */
/** Home map outlines on the hour: 2, 1, 0 and 23 Uhr (minutes before 4 Uhr). */
export const HOME_OUTLINE_MINUTES = [120, 180, 240, 300];
export const HOME_EDGES_MIN = [0, 120, 180, 210, 240, 270, 300];
export const HOME_COLORS = [
  '#1f8a5b',
  '#b5d53a',
  '#f7a334',
  '#ea5a3a',
  '#c22d5b',
  '#7c2287',
  '#2c3e8f',
];
/** Clock labels for the legend, one per band edge (band 0 is "after 3 Uhr"). */
export const HOME_TICKS = ['2', '1', '0:30', '0', '23:30', '23'];

export function homeBandOf(seconds: number): number {
  const min = seconds / 60;
  let b = 0;
  while (b < HOME_EDGES_MIN.length - 1 && min >= HOME_EDGES_MIN[b + 1]) b++;
  return b;
}

/** RGBA lookup for the home map, indexed by whole seconds before 4 Uhr. */
export function homeLut(): Uint8Array {
  const n = (HOME_EDGES_MIN[HOME_EDGES_MIN.length - 1] + 60) * 60 + 1;
  const lut = new Uint8Array(n * 4);
  const rgb = HOME_COLORS.map(hexToRgb);
  for (let i = 0; i < n; i++) {
    const c = rgb[homeBandOf(i)];
    lut.set([c[0], c[1], c[2], 255], i * 4);
  }
  return lut;
}

/**
 * Outlines without the colour fill: one every 10 minutes, dashed, in a single hue from
 * near-black purple at the start to a pale lilac far out, so the order reads at a glance.
 */
export const OUTLINE_STEP_MINUTES = [10, 20, 30, 40, 50, 60];
export const OUTLINE_STEP_COLORS = [
  '#1a0848',
  '#3b1d86',
  '#6440b4',
  '#8f6dd0',
  '#b69ce3',
  '#d6c8f2',
];

/** Line colours, roughly following the usual Berlin map conventions. */
export const MODE_COLORS: Record<string, string> = {
  sbahn: '#00843d',
  ubahn: '#0a5ea8',
  tram: '#c8102e',
  bus: '#7b2d8e',
  regional: '#8a1c1c',
  ferry: '#0090c8',
};
