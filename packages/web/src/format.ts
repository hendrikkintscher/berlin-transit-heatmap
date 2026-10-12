// Small text and number helpers for the cards and controls.

import { lang, t } from './i18n';
import type { RasterLayer } from './protocol';
import type { Point } from './url';
import type { Direction, When } from './when';

export function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** VBB names carry the town: "U Hermannplatz (Berlin)", "Berlin, Greifswalder Str." */
export const stopName = (n: string) => n.replace(/ \(Berlin\)$/, '').replace(/^Berlin, /, '');
/** Shorter still for the stop chain: "S+U Alexanderplatz Bhf" -> "Alexanderplatz". */
export const shortStop = (n: string) =>
  stopName(n)
    .replace(/^(S\+U|S|U) /, '')
    .replace(/ Bhf\b/, '');

export const hourLabel = (h: number) =>
  lang() === 'de' ? `${h} Uhr` : `${String(h).padStart(2, '0')}:00`;
export const clockLabel = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` + (lang() === 'de' ? ' Uhr' : '');

/** "werktags ab 10 Uhr" / "weekends from 02:00", for the tap readout. */
export function whenText(w: When, direction: Direction) {
  if (direction === 'arrive')
    return t(w.day === 'weekday' ? 'onWeekdaysArr' : 'onWeekendsArr', {
      hour: hourLabel(w.hour),
      next: hourLabel((w.hour + 1) % 24),
    });
  return t(w.day === 'weekday' ? 'onWeekdays' : 'onWeekends', { hour: hourLabel(w.hour) });
}

/** "13.10.2026" / "13 Oct 2026" from an ISO date. */
export function formatDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang() === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric',
    month: lang() === 'de' ? 'numeric' : 'short',
    year: 'numeric',
  });
}

/** Google Maps directions (public transport, or cycling); opens the app on phones. */
export function googleDirections(from: Point, to: Point, bicycling = false) {
  const p = (o: Point) => `${o.lat.toFixed(5)},${o.lon.toFixed(5)}`;
  const mode = bicycling ? 'bicycling' : 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${p(from)}&destination=${p(to)}&travelmode=${mode}`;
}

/** The value of a raster at a position, Infinity outside it. */
export function gridSeconds(
  r: RasterLayer,
  lat: number,
  lon: number,
  values = r.grid.seconds,
): number {
  const [w, s, e, n] = r.bbox;
  const { cols, rows } = r.grid;
  const c = Math.floor(((lon - w) / (e - w)) * cols);
  const row = Math.floor(((n - lat) / (n - s)) * rows);
  if (c < 0 || c >= cols || row < 0 || row >= rows) return Infinity;
  return values[row * cols + c];
}
