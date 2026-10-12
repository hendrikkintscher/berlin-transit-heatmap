// The journey to a tapped place, as shown in its card: line badges and a link to Google
// Maps, then changes, cycling and walking minutes and the stops along the way.

import { MODE_COLORS } from './colors';
import { escapeHtml, eveningClock, googleDirections, shortStop } from './format';
import { t } from './i18n';
import type { FromWorker, Travel } from './protocol';
import type { Point } from './url';
import type { Direction } from './when';

export type Trip = Extract<FromWorker, { type: 'trip' }>;

export interface TripContext {
  /** The start of each journey: one, or two with a meeting point. */
  starts: (Point | null)[];
  /** The tapped place. */
  here: Point | null;
  direction: Direction;
  travel: Travel;
  /** Seconds since midnight now, when the map is for today; null for another day. */
  now: number | null;
}

/** "los in 5 Min.", "jetzt los", or "los um 10:07" when it is not today or over an hour off. */
export function leaveText(leave: number, now: number | null): string {
  const wait = now === null ? Infinity : leave - now;
  if (wait < 60) return t('tripGoNow');
  if (wait < 3600) return t('tripLeaveIn', { n: Math.floor(wait / 60) });
  return t('tripLeaveAt', { time: eveningClock(leave) });
}

export function tripHtml(m: Pick<Trip, 'journeys'>, c: TripContext): string {
  const two = m.journeys.length > 1;
  return m.journeys
    .map((j, i) => {
      const mark = two ? `<i class="p${i + 1}"></i>` : '';
      if (!j) return `<span class="trip-sum">${mark}${t('tripNone')}</span>`;
      const walk = j.legs.reduce((a, l) => a + (l.type === 'walk' && !l.bike ? l.minutes : 0), 0);
      const bike = j.legs.reduce((a, l) => a + (l.type === 'walk' && l.bike ? l.minutes : 0), 0);
      const rides = j.legs.filter((l) => l.type === 'ride');
      const badges = rides
        .map(
          (l) =>
            `<span class="line-badge" style="background:${MODE_COLORS[l.mode] ?? '#444'}">${escapeHtml(l.name)}</span>`,
        )
        .join('<span class="trip-sep">›</span>');
      const sum = [
        rides.length
          ? t(j.transfers === 0 ? 'noTransfer' : j.transfers === 1 ? 'oneTransfer' : 'transfers', {
              n: j.transfers,
            })
          : '',
        bike ? t('tripBike', { n: bike }) : '',
        walk ? t('tripWalk', { n: walk }) : '',
      ].filter(Boolean);
      // Leaving: the next connection's own minutes, its arrival, and when to set off.
      // Arriving (Typisch, Bestfall): the last connection by the hour, with its minutes.
      const own =
        j.leave !== undefined && j.arrive !== undefined
          ? `<span class="trip-main">${mark}${t('tripMain', {
              n: Math.max(1, Math.round((j.arrive - j.leave) / 60)),
              time: eveningClock(j.arrive),
            })}</span><small class="trip-leave" data-leave="${j.leave}">${leaveText(j.leave, c.now)}</small>${j.board ? '<small class="trip-live" hidden></small>' : ''}`
          : j.minutes !== undefined
            ? `<span class="trip-now">${mark}${t(c.direction === 'depart' ? 'tripNext' : 'tripLast', { n: j.minutes })}</span>`
            : '';
      // Stops where you get on, change and get off.
      const stops = rides.length
        ? [rides[0].from, ...rides.map((l) => l.to)].map((n) => escapeHtml(shortStop(n)))
        : [];
      const start = c.starts[i];
      const link =
        start && c.here
          ? `<a class="trip-link" href="${googleDirections(
              c.direction === 'depart' ? start : c.here,
              c.direction === 'depart' ? c.here : start,
              c.travel === 'bikeonly',
            )}" target="_blank" rel="noopener">${t('openGoogle')}</a>`
          : '';
      return (
        own +
        `<span class="trip-sum">${own ? '' : mark}${badges}${link}</span>` +
        `<small class="trip-stops">${[sum.join(' · '), stops.join(' → ')].filter(Boolean).join(' · ')}</small>`
      );
    })
    .join('');
}
