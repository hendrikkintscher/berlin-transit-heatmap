// The time panels under the chip row: Zeit (Jetzt or an exact time, today, one of the next
// days or a typical weekday or weekend, the hour, leaving or arriving), Reisezeit (typical, best case or next
// departure) and Vergleich (a second time to compare with). The Zeit chip shows the choice.

import { clockLabel, dayLabel, hourLabel, pillText } from './format';
import { t } from './i18n';
import type { Measure } from './protocol';
import { $, type State } from './state';
import {
  arriveWhen,
  fullHour,
  isNow,
  isPastHour,
  leaveOffset,
  upcomingDays,
  whenAt,
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
    ...document.querySelectorAll<HTMLButtonElement>('#pop-when .seg [data-day]'),
  ];
  const hourGrid = $('hour-grid');
  const dirButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-dir]')];
  const measureButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-measure]')];
  const cmpDay = $<HTMLSelectElement>('cmp-day');
  const cmpHour = $<HTMLSelectElement>('cmp-hour');
  const cmpChip = $('cmp');
  const nowBtn = $<HTMLButtonElement>('now-btn');
  const timeInput = $<HTMLInputElement>('when-time');
  const timeBox = $('when-time-box');

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
    const hour = w.minute !== undefined || offset ? clockLabel(w.hour, minute) : hourLabel(w.hour);
    // Today goes without "Heute", so the chips fit a phone's width.
    whenBtn.querySelector('span')!.textContent =
      pillText(w, arrive, hour, true) +
      // Cycling alone has no timetable, so no Reisezeit: the bike stands in for it.
      (state.travel === 'bikeonly'
        ? ' · 🚲'
        : // Reisezeit lives in this panel too; the pill names it when it is not the default.
          state.measure === 'typical'
          ? ` · ${t('measureTypical')}`
          : state.measure === 'best'
            ? ` · ${t('measureBest')}`
            : '');
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
  ) {
    Object.assign(state, more);
    state.when = w;
    state.window = windowName(w);
    renderWhen();
    changed();
  }

  hourGrid.append(
    ...Array.from({ length: 24 }, (_, h) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.hour = String(h);
      b.textContent = String(h);
      b.addEventListener('click', () => {
        setWhen({ day: state.when.day, hour: h });
        closePanel();
      });
      return b;
    }),
  );
  const pickDay = (day: Day | undefined) => day && setWhen({ ...state.when, day });
  dayGrid.addEventListener('click', (e) =>
    pickDay((e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day),
  );
  for (const b of typicalButtons) b.addEventListener('click', () => pickDay(b.dataset.day));
  for (const b of dirButtons)
    b.addEventListener('click', () => {
      const direction = b.dataset.dir as Direction;
      const w =
        direction === 'arrive' && state.direction !== 'arrive'
          ? arriveWhen(state.when)
          : state.when;
      setWhen(w, { direction });
    });
  for (const b of measureButtons)
    b.addEventListener('click', () => {
      state.measureBefore = null;
      const measure = b.dataset.measure as Measure;
      // An exact time is always Nächste: Typisch and Bestfall go back to the full hour.
      setWhen(measure === 'next' ? state.when : fullHour(state.when), { measure });
    });
  nowBtn.addEventListener('click', () => {
    state.measureBefore = null;
    setWhen(whenAt(new Date()), { direction: 'depart', measure: 'next' });
    closePanel();
  });
  timeInput.addEventListener('change', () => {
    const m = /^(\d{2}):(\d{2})/.exec(timeInput.value);
    if (!m) return;
    state.measureBefore = null;
    setWhen({ day: state.when.day, hour: Number(m[1]), minute: Number(m[2]) }, { measure: 'next' });
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
  return { renderWhen, setWhen };
}
