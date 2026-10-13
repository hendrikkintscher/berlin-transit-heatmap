// Small text and number helpers for the cards and controls.

import { cellAt } from '@berlin-transit-heatmap/routing';
import { lang, t } from './i18n';
import type { Measure, RasterLayer } from './protocol';
import { stopName } from './stop-name';
import {
  addDays,
  isDate,
  upcomingDays,
  weekdayOf,
  type Day,
  type Direction,
  type When,
} from './when';

export function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Shorter still for the stop chain: "S+U Alexanderplatz Bhf" -> "Alexanderplatz". */
export const shortStop = (n: string) =>
  stopName(n)
    .replace(/^(S\+U|S|U) /, '')
    .replace(/ Bhf\b/, '');

export const hourLabel = (h: number) =>
  lang() === 'de' ? `${h} Uhr` : `${String(h).padStart(2, '0')}:00`;
export const clockLabel = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` + (lang() === 'de' ? ' Uhr' : '');

/** A time in seconds after midnight of the evening (25 h = 1 Uhr), as "01:05 Uhr". */
export const eveningClock = (s: number) =>
  clockLabel(Math.floor(s / 3600) % 24, Math.floor((s % 3600) / 60));

/** "Mi 14." / "Wed 14" for a YYYYMMDD date. */
export function dateLabel(day: string) {
  const name = t('weekdayNames').split(',')[weekdayOf(day)];
  return `${name} ${Number(day.slice(6, 8))}${lang() === 'de' ? '.' : ''}`;
}

/** "Heute", "Morgen", "Mi 14.", or "Werktag" / "Wochenende" for a typical day. */
export function dayLabel(day: Day, now = new Date()) {
  if (!isDate(day)) return t(day === 'weekend' ? 'weekend' : 'weekday');
  const i = upcomingDays(now).indexOf(day);
  return i === 0 ? t('today') : i === 1 ? t('tomorrow') : dateLabel(day);
}

/**
 * The pill: "Heute ab 10 Uhr", "Mo–Fr an 9 Uhr"; `short` (the Zeit chip) leaves out
 * "Heute": "ab 10 Uhr".
 */
export function pillText(w: When, arrive: boolean, hour: string, short = false) {
  if (short && isDate(w.day) && upcomingDays().indexOf(w.day) === 0)
    return t(arrive ? 'todayArr' : 'todayAt', { hour });
  if (isDate(w.day)) return t(arrive ? 'dateArr' : 'dateAt', { day: dayLabel(w.day), hour });
  const weekday = w.day === 'weekday';
  return t(weekday ? (arrive ? 'weekdayArr' : 'weekdayAt') : arrive ? 'weekendArr' : 'weekendAt', {
    hour,
  });
}

/**
 * The Zeit chip, kept short so the chip row fits a 360 px phone: a clock time goes
 * without "Uhr" ("ab 17:40") and the Reisezeit is one mark ("· Ø"). `full` is the same
 * spelled out, for screen readers. Cycling alone has no timetable and adds nothing (the
 * Bahn chip says "Nur Rad").
 */
export function whenChipText(
  w: When,
  arrive: boolean,
  minute: number | undefined,
  measure: Measure,
  full = false,
) {
  const hour =
    minute === undefined
      ? hourLabel(w.hour)
      : full
        ? clockLabel(w.hour, minute)
        : `${String(w.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const mark =
    measure === 'next'
      ? ''
      : full
        ? t(measure === 'typical' ? 'measureTypical' : 'measureBest')
        : t(measure === 'typical' ? 'measureMarkTypical' : 'measureMarkBest');
  return pillText(w, arrive, hour, true) + (mark ? ` · ${mark}` : '');
}

/** "in der Nacht Mi 14. auf Do 15." / "unter der Woche", for the home map. */
export function nightText(day: Day) {
  if (!isDate(day)) return t(day === 'weekday' ? 'homeWeekday' : 'homeWeekend');
  return t('homeDate', { day: dateLabel(day), next: dateLabel(addDays(day, 1)) });
}

/** "werktags ab 10 Uhr" / "heute ab 10 Uhr" / "weekends from 02:00", for the tap readout. */
export function whenText(w: When, direction: Direction) {
  if (isDate(w.day)) {
    const i = upcomingDays().indexOf(w.day);
    const day =
      i === 0 ? t('onToday') : i === 1 ? t('onTomorrow') : t('onDay', { day: dateLabel(w.day) });
    return t(direction === 'arrive' ? 'onDateArr' : 'onDateAt', {
      day,
      hour: hourLabel(w.hour),
      next: hourLabel((w.hour + 1) % 24),
    });
  }
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

/** The value of a raster at a position, Infinity outside it. */
export function gridSeconds(
  r: RasterLayer,
  lat: number,
  lon: number,
  values = r.grid.seconds,
): number {
  const k = cellAt({ bbox: r.bbox, cols: r.grid.cols, rows: r.grid.rows }, lat, lon);
  return k < 0 ? Infinity : values[k];
}
