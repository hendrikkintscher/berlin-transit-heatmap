// "What's different today": a small notice listing the U-Bahn, S-Bahn and tram lines that
// run differently on the shown date (changes.json, made by the timetable build). Tapping a
// line shows its stretch on the map. The file is small (about 3 KB gzipped) and fetched only
// once the first timetable is in, so it never holds up the first map.

import type maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { MODE_COLORS } from './colors';
import { dateLabel, dayLabel, escapeHtml, formatDate, shortStop } from './format';
import { lang, t } from './i18n';
import { CHANGES_SOURCE } from './map-layers';
import { $, type State } from './state';
import { isDate, isoDay, upcomingDays } from './when';

/** One entry of changes.json (timetable-build changes.ts). */
export interface Change {
  line: string;
  mode: string;
  kind: 'off' | 'gap' | 'skip';
  replacement: boolean;
  from: string;
  to: string;
  until?: string;
  path: [number, number][];
  gone: [number, number];
}

interface ChangesFile {
  version: 1;
  days: Record<string, Change[]>;
}

/** "kein Verkehr Am Kupfergraben – Mollstr./Prenzlauer Allee · bis 21.10." */
export function changeText(c: Change, day: string): string {
  const from = shortStop(c.from);
  const to = shortStop(c.to);
  const what =
    c.kind === 'off'
      ? t(c.replacement ? 'changeOffSev' : 'changeOff')
      : c.kind === 'skip'
        ? t('changeSkip', { stop: from })
        : t(c.replacement ? 'changeSev' : 'changeGap', { from, to });
  if (!c.until) return what;
  const until =
    c.until === isoDay(day)
      ? t('changeOneDay')
      : t('changeUntil', { date: formatDate(c.until).replace(/\s?\d{4}$/, '') });
  return `${what} · ${until}`;
}

/** The lines, each once, in the file's order: "M2, M5, M8". */
export function changedLines(list: Change[]): string[] {
  return [...new Set(list.map((c) => c.line))];
}

/** "Heute" / "today", "Mi 14." / "on Wed 14" for the notice. */
function noticeDay(day: string, now = new Date()) {
  if (lang() === 'de') return dayLabel(day, now);
  const i = upcomingDays(now).indexOf(day);
  return i === 0 ? t('onToday') : i === 1 ? t('onTomorrow') : t('onDay', { day: dateLabel(day) });
}

export interface ChangesDeps {
  map: maplibregl.Map;
  state: State;
  dataBase: string;
}

export function initChanges({ map, state, dataBase }: ChangesDeps) {
  const box = $('changes');
  const chip = $<HTMLButtonElement>('changes-chip');
  const panel = $('changes-panel');
  const list = $<HTMLUListElement>('changes-list');
  let file: ChangesFile | null = null;
  let loading = false;
  let open = false;
  let shown: Change | null = null;
  const closed = new Set<string>();

  const today = () => (isDate(state.when.day) ? (file?.days[state.when.day] ?? []) : []);

  function load() {
    if (file || loading) return;
    loading = true;
    // When the browser is idle; the routing runs in the worker meanwhile.
    const go = () =>
      fetch(new URL('changes.json', dataBase))
        .then((r) => (r.ok ? (r.json() as Promise<ChangesFile>) : null))
        .then((f) => {
          if (f?.version === 1) file = f;
          render();
        })
        .catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 300);
  }

  function draw(c: Change | null) {
    shown = c;
    const src = map.getSource(CHANGES_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;
    if (!c) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const [g0, g1] = c.gone;
    const names = [c.from, c.to];
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: c.path },
        },
        ...c.path.map((p, i) => {
          const end = i === 0 ? names[0] : i === c.path.length - 1 ? names[1] : null;
          return {
            type: 'Feature' as const,
            properties: {
              gone: i >= g0 && i <= g1,
              ...(end ? { name: shortStop(end) } : {}),
            },
            geometry: { type: 'Point' as const, coordinates: p },
          };
        }),
      ],
    });
    const lons = c.path.map((p) => p[0]);
    const lats = c.path.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        // Clear of the header and of everything at the bottom, the notice included.
        padding: {
          top: 90,
          bottom: Math.max(60, innerHeight - box.getBoundingClientRect().top + 20),
          left: 40,
          right: 40,
        },
        maxZoom: 14.5,
        duration: 500,
      },
    );
  }

  function render() {
    const day = state.when.day;
    const items = today();
    const hide = !items.length || closed.has(day);
    box.hidden = hide;
    if (hide) {
      open = false;
      if (shown) draw(null);
      return;
    }
    if (shown && !items.includes(shown)) draw(null);
    const label = noticeDay(day);
    // With a stretch on the map the notice names it; tapped, it opens the list again.
    chip.textContent = shown
      ? `${shown.line}: ${changeText(shown, day)}`
      : t('changesChip', { day: label, lines: changedLines(items).join(', ') });
    chip.classList.toggle('picked', !!shown);
    chip.setAttribute('aria-expanded', String(open));
    chip.hidden = open;
    panel.hidden = !open;
    if (!open) return;
    $('changes-title').textContent = t('changesTitle', { day: label });
    $('changes-note').textContent = t('changesNote');
    list.innerHTML = items
      .map(
        (c, i) =>
          `<li><button type="button" data-i="${i}" aria-pressed="${c === shown}"><span class="line-badge" style="background:${MODE_COLORS[c.mode] ?? '#444'}">${escapeHtml(c.line)}</span> <span>${escapeHtml(changeText(c, day))}</span></button></li>`,
      )
      .join('');
  }

  chip.addEventListener('click', () => {
    // One entry: show it at once.
    const items = today();
    if (items.length === 1 && !shown) {
      draw(items[0]!);
      render();
      return;
    }
    open = true;
    render();
  });
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b) return;
    const c = today()[Number(b.dataset.i)] ?? null;
    if (c === shown) return;
    // The list closes to one line so the map shows the stretch.
    open = false;
    render();
    draw(c);
    render();
  });
  // ✕ steps back: the list, then the stretch, then the notice for this day.
  $('changes-close').addEventListener('click', () => {
    if (open) open = false;
    else if (shown) draw(null);
    else closed.add(state.when.day);
    render();
  });

  return {
    /** The shown day changed, or the language; loads the file the first time. */
    update() {
      // Not before the first timetable is in: the map comes first.
      if (Object.keys(state.info).length) load();
      render();
    },
  };
}
