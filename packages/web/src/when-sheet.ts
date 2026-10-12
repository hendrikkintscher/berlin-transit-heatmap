// The time panels under the chip row: Zeit (today, one of the next days or a typical
// weekday or weekend, the hour, leaving or arriving), Reisezeit (typical, best case or next
// departure) and Vergleich (a second time to compare with). The Zeit chip shows the choice.

import { clockLabel, dayLabel, hourLabel, pillText } from './format';
import { t } from './i18n';
import type { Measure } from './protocol';
import { $, type State } from './state';
import { leaveOffset, upcomingDays, windowName, type Day, type Direction, type When } from './when';

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
    // Bike and step-free have their own chips; cycling alone has no timetable time.
    whenBtn.querySelector('span')!.textContent =
      state.travel === 'bikeonly'
        ? t('travelBikeOnlyPill')
        : pillText(
            w,
            arrive,
            offset ? clockLabel(w.hour, Math.floor(offset / 60)) : hourLabel(w.hour),
          );
    renderDays();
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
        a: whenBtn.querySelector('span')!.textContent ?? '',
        b: pillText(c, arrive, hourLabel(c.hour)),
      });
    for (const b of [...dayGrid.children, ...typicalButtons])
      b.setAttribute('aria-checked', String((b as HTMLElement).dataset.day === w.day));
    for (const b of hourGrid.children)
      b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.hour) === w.hour));
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
        setWhen({ ...state.when, hour: h });
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
    b.addEventListener('click', () =>
      setWhen(state.when, { direction: b.dataset.dir as Direction }),
    );
  for (const b of measureButtons)
    b.addEventListener('click', () => {
      state.measureBefore = null;
      setWhen(state.when, { measure: b.dataset.measure as Measure });
    });
  const readCompare = (): When | null =>
    cmpDay.value ? { day: cmpDay.value, hour: Number(cmpHour.value) } : null;
  cmpDay.addEventListener('change', () => {
    // Turning it on for the same day suggests the other end of it: night by day, 10 Uhr by night.
    const c = readCompare();
    if (c && !state.compare && c.day === state.when.day) c.hour = state.when.hour >= 5 ? 2 : 10;
    setWhen(state.when, { compare: c });
  });
  cmpHour.addEventListener('change', () => setWhen(state.when, { compare: readCompare() }));
  $('cmp-close').addEventListener('click', () => setWhen(state.when, { compare: null }));
  return { renderWhen, setWhen };
}
