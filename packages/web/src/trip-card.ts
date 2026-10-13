// The journey to a tapped place, as shown in its card: line badges, then changes, cycling
// and walking minutes and the stops along the way.

import { MODE_COLORS } from './colors';
import { escapeHtml, eveningClock, shortStop } from './format';
import { stopName } from './stop-name';
import { t } from './i18n';
import { icon } from './icons';
import type { FromWorker } from './protocol';
import type { Direction } from './when';

export type Trip = Extract<FromWorker, { type: 'trip' }>;

export interface TripContext {
  direction: Direction;
  /** Seconds since midnight now, when the map is for today; null for another day. */
  now: number | null;
  /** The tapped place's own name (a search result), used for its end of the trip. */
  place?: string;
  /** "U2: Ersatzverkehr Pankow – Alexanderplatz" for a ride whose line runs differently. */
  changeNote?: (ride: { name: string; mode: string }) => string | null;
  /** Under Typisch, the hour's average minutes the map shows for the place (one start). */
  avg?: number;
  /** A meeting point's start names, by start ("" for none). */
  names?: readonly string[];
  /**
   * One start: the ends as two rows, Start and Ziel, the map's own place (the one it is
   * computed from or to) marked with the rings; the other row holds the slot for the
   * button that moves the map there.
   */
  rows?: { anchorTitle: string };
}

/**
 * "los in 5 Min.", "jetzt los", or "los um 10:07" when it is not today, over an hour off
 * or already gone (an hour earlier today).
 */
export function leaveText(leave: number, now: number | null): string {
  const wait = now === null ? Infinity : leave - now;
  if (wait < -60) return t('tripLeaveAt', { time: eveningClock(leave) });
  if (wait < 60) return t('tripGoNow');
  if (wait < 3600) return t('tripLeaveIn', { n: Math.floor(wait / 60) });
  return t('tripLeaveAt', { time: eveningClock(leave) });
}

/**
 * The card's connections: one per start. A meeting point shows the first start's trip and
 * folds the others behind "N weitere Fahrten", so the card stays short.
 */
export function tripHtml(m: Pick<Trip, 'journeys'>, c: TripContext): string {
  const [first = '', ...rest] = journeyHtml(m, c);
  if (!rest.length) return first;
  const more = t(rest.length === 1 ? 'tripMoreOne' : 'tripMore', { n: rest.length });
  return `${first}<details class="trip-more"><summary>${more}</summary>${rest.join('')}</details>`;
}

function journeyHtml(m: Pick<Trip, 'journeys'>, c: TripContext): string[] {
  const two = m.journeys.length > 1;
  return m.journeys.map((j, i) => {
    const name = two && c.names?.[i] ? `<b class="trip-who">${escapeHtml(c.names[i]!)}</b> ` : '';
    const mark = two ? `<i class="p${i + 1}"></i>${name}` : '';
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
    const n =
      j.leave !== undefined && j.arrive !== undefined
        ? Math.max(1, Math.round((j.arrive - j.leave) / 60))
        : 0;
    // The map's average for the hour, named as such, when it differs from this connection.
    const avg =
      n && !two && c.avg !== undefined && Math.abs(c.avg - n) > 1
        ? `<small class="trip-avg">${t('tripAvg', { n: c.avg })}</small>`
        : '';
    const own =
      j.leave !== undefined && j.arrive !== undefined
        ? `<span class="trip-main">${mark}${t('tripMain', {
            n,
            time: eveningClock(j.arrive),
          })}</span><small class="trip-leave" data-leave="${j.leave}">${leaveText(j.leave, c.now)}</small>${j.board ? '<small class="trip-live" hidden></small>' : ''}${avg}`
        : j.minutes !== undefined
          ? `<span class="trip-now">${mark}${t(c.direction === 'depart' ? 'tripNext' : 'tripLast', { n: j.minutes })}</span>`
          : '';
    // Where from and where to: the nearest stops (the place's own name when it has one).
    const ends = (j.ends ?? [null, null]).map((n) => n && shortStop(n));
    if (c.place) ends[c.direction === 'depart' ? 1 : 0] = c.place;
    const named =
      !two && ends[0] && ends[1] && ends[0] !== ends[1]
        ? c.rows
          ? endRows(ends[0], ends[1]!, c.direction, c.rows.anchorTitle)
          : `<small class="trip-ends">${escapeHtml(ends[0])} → ${escapeHtml(ends[1]!)}</small>`
        : '';
    const timeline = timelineHtml(j.legs);
    // Stops where you get on, change and get off (the timeline has them with times).
    const stops = rides.length
      ? [rides[0].from, ...rides.map((l) => l.to)].map((n) => escapeHtml(shortStop(n)))
      : [];
    // What runs differently today on the lines of this connection.
    const notes = [...new Set(rides.map((l) => c.changeNote?.(l)).filter(Boolean))];
    // The summary (minutes, times, lines, changes and walking): a tap on it opens the
    // detailed connection below it (#readout.expanded), when there is one.
    const opens = !!timeline || stops.length > 0;
    const head = opens
      ? `<span class="trip-head opens" role="button" tabindex="0" aria-expanded="false" title="${t('details')}">`
      : '<span class="trip-head">';
    return (
      named +
      head +
      own +
      `<span class="trip-sum">${own ? '' : mark}${badges}</span>` +
      // Changes and walking always show; the stops only when opened.
      `<small class="trip-stops">${sum.join(' · ')}${
        stops.length && !timeline
          ? `<span class="stops">${sum.length ? ' · ' : ''}${stops.join(' → ')}</span>`
          : ''
      }</small>` +
      notes.map((n) => `<small class="trip-change">${escapeHtml(n!)}</small>`).join('') +
      '</span>' +
      timeline
    );
  });
}

/**
 * The trip's ends as two rows. Departing, the map's place is the Start; arriving, the Ziel.
 * That row shows the rings; the other has the `.anchor-slot` for the button moving them.
 */
function endRows(start: string, end: string, direction: Direction, anchorTitle: string): string {
  const row = (role: 'start' | 'end', name: string) => {
    const anchor = (direction === 'depart') === (role === 'start');
    const mark = anchor
      ? `<i class="rings" title="${escapeHtml(anchorTitle)}">${icon('rings', 22)}</i>`
      : '<span class="anchor-slot"></span>';
    return `<span class="trip-row ${role}${anchor ? ' anchor' : ''}"><i class="dot"></i><small class="role">${t(role === 'start' ? 'dirThere' : 'dirBack')}</small><span class="name">${escapeHtml(name)}</span>${mark}</span>`;
  };
  return `<span class="trip-rows">${row('start', start)}${row('end', end)}</span>`;
}

/** "10:02" (seconds of the day, past midnight too). */
export const hhmm = (s: number) => {
  const m = Math.floor(s / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

type Legs = NonNullable<Trip['journeys'][number]>['legs'];

/**
 * The detailed view (a tap on the summary): each ride with its times, the stops in between
 * folded, and at each change the walk and the wait. Empty without the rides' times.
 */
export function timelineHtml(legs: Legs): string {
  const rides = legs.filter((l) => l.type === 'ride');
  if (!rides.length || rides.some((l) => l.dep === undefined || l.arr === undefined)) return '';
  const row = (time: number, name: string) =>
    `<li class="tl-stop"><time>${hhmm(time)}</time><span>${escapeHtml(stopName(name))}</span></li>`;
  const walkText = (l: Extract<Legs[number], { type: 'walk' }>) =>
    t(l.bike ? 'tripBike' : 'tripWalk', { n: l.minutes });
  const out: string[] = [];
  let prev: Extract<Legs[number], { type: 'ride' }> | null = null;
  let walked = 0;
  let walks: string[] = [];
  for (const l of legs) {
    if (l.type === 'walk') {
      walked += l.minutes;
      walks.push(walkText(l));
      continue;
    }
    if (prev) {
      // The change: the walk (if any) and the time left over at the next stop.
      const wait = Math.max(0, Math.round((l.dep! - prev.arr!) / 60) - walked);
      const parts = [t('tlChange'), ...walks, wait ? t('tlWait', { n: wait }) : ''];
      out.push(`<li class="tl-change">${parts.filter(Boolean).join(' · ')}</li>`);
    } else if (walks.length) out.push(`<li class="tl-walk">${walks.join(' · ')}</li>`);
    walked = 0;
    walks = [];
    const color = MODE_COLORS[l.mode] ?? '#444';
    const minutes = Math.max(1, Math.round((l.arr! - l.dep!) / 60));
    const passed = l.passed ?? [];
    const summary = passed.length
      ? t(passed.length === 1 ? 'tlPassedOne' : 'tlPassed', { n: passed.length, m: minutes })
      : t('tlDirect', { m: minutes });
    const inner = passed.length
      ? `<details class="tl-passed"><summary>${summary}</summary><ol>${passed
          .map((p) => row(p.at, p.name))
          .join('')}</ol></details>`
      : `<small>${summary}</small>`;
    out.push(
      `<li class="tl-ride" style="--line:${color}"><ol>${row(l.dep!, l.from)}<li class="tl-mid"><span class="line-badge" style="background:${color}">${escapeHtml(l.name)}</span>${inner}</li>${row(l.arr!, l.to)}</ol></li>`,
    );
    prev = l;
  }
  if (walks.length) out.push(`<li class="tl-walk">${walks.join(' · ')}</li>`);
  return `<ol class="timeline">${out.join('')}</ol>`;
}
