// Sequential ramp for the 5-minute bands: fast = light yellow, slow = dark purple.
export const BAND_SECONDS = 300;
export const MAX_BAND = 18; // band 18 = 90+ min

const STOPS = [
  '#ffffa0',
  '#fde24a',
  '#f9a93c',
  '#ef6b4a',
  '#d23c6c',
  '#9b2a8a',
  '#5e1f8c',
  '#2d0f5e',
];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

export function bandColor(band: number): string {
  const t = (Math.min(band, MAX_BAND) / MAX_BAND) * (STOPS.length - 1);
  const i = Math.min(Math.floor(t), STOPS.length - 2);
  return mix(STOPS[i], STOPS[i + 1], t - i);
}

export const BAND_COLORS = Array.from({ length: MAX_BAND + 1 }, (_, b) => bandColor(b));

export function bandLabel(band: number): string {
  const m = (band * BAND_SECONDS) / 60;
  return band >= MAX_BAND ? `${m}+` : `${m}–${m + 5}`;
}
