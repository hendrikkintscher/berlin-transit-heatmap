// The time panels under the chip row: Zeit (Jetzt or an exact time, today, one of the next
// days or a typical weekday or weekend, the hour, leaving or arriving), Reisezeit (typical, best case or next
// departure) and Vergleich (a second time to compare with). The Zeit chip shows the choice.

import { clockLabel, dayLabel, hourLabel, pillText, whenChipText } from './format';
import { t } from './i18n';
import type { Measure } from './protocol';
import { $, type State } from './state';
import {
  arriveWhen,
  fullHour,
  isNow,
  isPastHour,
  isPastTime,
  laterWhen,
  leaveOffset,
  sameWhen,
  tripWhen,
  upcomingDays,
  whenAt,
  whenParam,
  windowName,
  type Day,
  type Direction,
  type When,
} from './when';

export interface WhenSheetDeps {
  state: State;
  /** The time changed: recompute the map. */
  changed: () => void;
  /** Picking an hour closes the Zeit panel. */
  closePanel: () => void;
  /** The chips show the new choice. */
  rendered: () => void;
}

export function initWhenSheet({ state, changed, closePanel, rendered }: WhenSheetDeps) {
  const whenBtn = $<HTMLButtonElement>('when-btn');
  const dayGrid = $('day-grid');
  const typicalButtons = [
    ...document.querySelectorAll<HTMLButtonElement>('#pop-when .day-row > [data-day]'),
  ];
  const laterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-later]')];
  /**
   * The day switching to Ankommen moved on from (in the last hour of the day it moves to
   * tomorrow 0 Uhr): an exact time set right after that, still ahead on it, stays there.
   */
  let arriveMoved: Day | null = null;
  const hourGrid = $('hour-grid');
  const dirButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-dir]')];
  const measureButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-measure]')];
  const cmpDay = $<HTMLSelectElement>('cmp-day');
  const cmpHour = $<HTMLSelectElement>('cmp-hour');
  const cmpChip = $('cmp');
  const nowBtn = $<HTMLButtonElement>('now-btn');
  const timeInput = $<HTMLInputElement>('when-time');
  const timeBox = $('when-time-box');
  const dayRow = document.querySelector<HTMLElement>('#pop-when .day-row')!;

  /** Today and the next days (they move on at midnight), then the typical days to compare. */
  function renderDays() {
    const days = upcomingDays();
    const labels = days.map((d) => dayLabel(d));
    if (dayGrid.dataset.days !== days.join() || dayGrid.dataset.lang !== labels.join()) {
      dayGrid.dataset.days = days.join();
      dayGrid.dataset.lang = labels.join();
      dayGrid.replaceChildren(
        ...days.map((d, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.dataset.day = d;
          b.textContent = labels[i]!;
          return b;
        }),
      );
      cmpDay.replaceChildren(
        cmpDay.options[0]!,
        ...days.map((d, i) => new Option(labels[i], d)),
        ...(['weekday', 'weekend'] as const).map((d) => new Option(dayLabel(d), d)),
      );
    }
  }

  function renderWhen() {
    const w = state.when;
    const arrive = state.direction === 'arrive';
    const offset = !arrive && state.measure === 'next' ? leaveOffset(w) : 0;
    const minute = w.minute ?? Math.floor(offset / 60);
    const exact = w.minute !== undefined || offset ? minute : undefined;
    const hour = exact !== undefined ? clockLabel(w.hour, exact) : hourLabel(w.hour);
    // Today goes without "Heute", so the chips fit a phone's width.
    const measure = state.travel === 'bikeonly' ? 'next' : state.measure;
    whenBtn.querySelector('span')!.textContent = whenChipText(w, arrive, exact, measure);
    whenBtn.setAttribute(
      'aria-label',
      `${t('whenOpen')}: ${whenChipText(w, arrive, exact, measure, true)}`,
    );
    renderDays();
    // Jetzt: today's current hour, leaving on the clock under Nächste.
    nowBtn.setAttribute('aria-pressed', String(!arrive && state.measure === 'next' && isNow(w)));
    timeBox.classList.toggle('on', w.minute !== undefined);
    timeInput.value = `${String(w.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    $('when-hour').textContent = t(arrive ? 'whenHourArr' : 'whenHour');
    for (const b of dirButtons)
      b.setAttribute('aria-checked', String(b.dataset.dir === state.direction));
    for (const b of measureButtons)
      b.setAttribute('aria-checked', String(b.dataset.measure === state.measure));
    $('measure-note').textContent = t(
      state.measure === 'best'
        ? 'measureNoteBest'
        : state.measure === 'next'
          ? arrive
            ? 'measureNoteNextArr'
            : 'measureNoteNext'
          : arrive
            ? 'measureNoteTypicalArr'
            : 'measureNoteTypical',
    );
    const c = state.compare;
    cmpDay.value = c?.day ?? '';
    cmpHour.disabled = !c;
    if (cmpHour.options.length !== 24)
      cmpHour.replaceChildren(
        ...Array.from({ length: 24 }, (_, h) => new Option(hourLabel(h), String(h))),
      );
    for (const o of cmpHour.options) o.textContent = hourLabel(Number(o.value));
    cmpHour.value = String(c?.hour ?? w.hour);
    cmpChip.hidden = !c;
    if (c)
      $('cmp-text').textContent = t('compareChip', {
        a: pillText(w, arrive, hour),
        b: pillText(c, arrive, hourLabel(c.hour)),
      });
    for (const b of [...dayGrid.children, ...typicalButtons])
      b.setAttribute('aria-checked', String((b as HTMLElement).dataset.day === w.day));
    // Typical days sit at the end of the row, so the chosen one is scrolled into view.
    const picked = dayRow.querySelector<HTMLElement>('[aria-checked="true"]');
    if (picked && picked.offsetLeft + picked.offsetWidth > dayRow.scrollLeft + dayRow.clientWidth)
      dayRow.scrollLeft = picked.offsetLeft + picked.offsetWidth - dayRow.clientWidth;
    // Today's hours that are over are greyed out (the chosen one stays as it is).
    const now = new Date();
    for (const b of hourGrid.children as HTMLCollectionOf<HTMLButtonElement>) {
      const h = Number(b.dataset.hour);
      b.setAttribute('aria-pressed', String(h === w.hour));
      b.disabled = h !== w.hour && isPastHour(w.day, h, state.direction, now);
    }
    rendered();
  }

  function setWhen(
    w: When,
    more: Partial<{ direction: Direction; measure: Measure; compare: When | null }> = {},
    quiet = false,
  ) {
    Object.assign(state, more);
    state.when = w;
    state.window = windowName(w);
    renderWhen();
    if (!quiet) changed();
  }

  hourGrid.append(
    ...Array.from({ length: 24 }, (_, h) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.hour = String(h);
      b.textContent = String(h);
      b.addEventListener('click', () => {
        arriveMoved = null;
        setWhen({ day: state.when.day, hour: h });
        closePanel();
      });
      return b;
    }),
  );
  const pickDay = (day: Day | undefined) => {
    if (!day) return;
    arriveMoved = null;
    setWhen({ ...state.when, day });
  };
  dayGrid.addEventListener('click', (e) =>
    pickDay((e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day),
  );
  for (const b of typicalButtons) b.addEventListener('click', () => pickDay(b.dataset.day));
  /** Leaving's time before switching to Ankommen, and the time that switch gave it. */
  let beforeArrive: { depart: When; arrive: When } | null = null;
  /** The time before the map moved to the trip's other end, and the trip's time it took. */
  let beforeMove: { direction: Direction; when: When; moved: When } | null = null;
  /**
   * Losfahren or Ankommen (the trip card's ⇅ uses it too). `quiet` only sets it: the caller
   * recomputes the map itself, when the start moves in the same step. `at`, when the map
   * moves to the other end of the shown trip (seconds of the day): the trip's arrival when
   * turning to Ankommen, its departure when turning to Losfahren, to the minute (Typisch and
   * Bestfall: the hour it falls in), so the map fits the trip; moving back brings the time
   * before.
   */
  function setDirection(direction: Direction, quiet = false, at?: number) {
    const back = beforeMove;
    beforeMove = null;
    if (back && back.direction === direction && sameWhen(back.moved, state.when)) {
      beforeArrive = null;
      arriveMoved = null;
      return setWhen(back.when, { direction }, quiet);
    }
    const moved =
      at !== undefined && direction !== state.direction
        ? tripWhen(state.when.day, at, direction, state.measure === 'next')
        : null;
    if (moved) {
      beforeMove = { direction: state.direction, when: state.when, moved };
      beforeArrive = null;
      arriveMoved = null;
      return setWhen(moved, { direction }, quiet);
    }
    let w = state.when;
    if (direction === 'arrive' && state.direction !== 'arrive') {
      w = arriveWhen(state.when);
      beforeArrive = { depart: state.when, arrive: w };
    } else if (direction === 'depart' && state.direction === 'arrive') {
      // Straight back (Ziel back to Start): leaving at the time it was before.
      if (beforeArrive && whenParam(beforeArrive.arrive) === whenParam(state.when))
        w = beforeArrive.depart;
      beforeArrive = null;
    }
    arriveMoved = direction === 'arrive' && w.day !== state.when.day ? state.when.day : null;
    setWhen(w, { direction }, quiet);
  }
  for (const b of dirButtons)
    b.addEventListener('click', () => setDirection(b.dataset.dir as Direction));
  for (const b of measureButtons)
    b.addEventListener('click', () => {
      state.measureBefore = null;
      const measure = b.dataset.measure as Measure;
      // An exact time is always Nächste: Typisch and Bestfall go back to the full hour.
      setWhen(measure === 'next' ? state.when : fullHour(state.when), { measure });
    });
  nowBtn.addEventListener('click', () => {
    state.measureBefore = null;
    arriveMoved = null;
    setWhen(whenAt(new Date()), { direction: 'depart', measure: 'next' });
    closePanel();
  });
  // A bit later: leaving that many minutes from now (an exact time, so Nächste).
  for (const b of laterButtons)
    b.addEventListener('click', () => {
      state.measureBefore = null;
      arriveMoved = null;
      setWhen(laterWhen(Number(b.dataset.later)), { direction: 'depart', measure: 'next' });
      closePanel();
    });
  timeInput.addEventListener('change', () => {
    const m = /^(\d{2}):(\d{2})/.exec(timeInput.value);
    if (!m) return;
    state.measureBefore = null;
    const time = { hour: Number(m[1]), minute: Number(m[2]) };
    const back = arriveMoved && { day: arriveMoved, ...time };
    const w = back && !isPastTime(back, state.direction) ? back : { day: state.when.day, ...time };
    arriveMoved = null;
    setWhen(w, { measure: 'next' });
    closePanel();
  });
  const readCompare = (): When | null =>
    cmpDay.value ? { day: cmpDay.value, hour: Number(cmpHour.value) } : null;
  cmpDay.addEventListener('change', () => {
    // Turning it on keeps the hour (another day at the same time); for the same day it
    // suggests two hours later (earlier late in the evening), still within the day's service.
    const c = readCompare();
    if (c && !state.compare)
      c.hour =
        c.day !== state.when.day
          ? state.when.hour
          : state.when.hour + 2 <= 23
            ? state.when.hour + 2
            : state.when.hour - 2;
    setWhen(state.when, { compare: c });
  });
  cmpHour.addEventListener('change', () => setWhen(state.when, { compare: readCompare() }));
  $('cmp-close').addEventListener('click', () => setWhen(state.when, { compare: null }));
  return { renderWhen, setWhen, setDirection };
}
