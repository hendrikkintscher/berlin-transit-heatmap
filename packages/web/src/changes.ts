// "What's different today": the U-Bahn, S-Bahn and tram lines that run differently on the
// shown date (changes.json, made by the timetable build). Never a popup of its own (Hendrik,
// 2026-10-13): Mehr has a "Heute anders" entry that opens a box with the whole day's list,
// and a change note on the trip card opens the same box for its line. Tapping a line in
// the box shows its stretch on the map. The file is small (about 3 KB gzipped) and fetched
// only once the first timetable is in, so it never holds up the first map.

import type maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { MODE_COLORS } from './colors';
import { dateLabel, dayLabel, escapeHtml, formatDate, shortStop } from './format';
import { lang, t } from './i18n';
import { CHANGES_SOURCE } from './map-layers';
import { dataUrl } from './data-url';
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

/** An entry's two parts: what is different, and until when ("bis 21.10."), if known. */
export function changeParts(c: Change, day: string): { what: string; until: string } {
  const from = shortStop(c.from);
  const to = shortStop(c.to);
  const what =
    c.kind === 'off'
      ? t(c.replacement ? 'changeOffSev' : 'changeOff')
      : c.kind === 'skip'
        ? t('changeSkip', { stop: from })
        : t(c.replacement ? 'changeSev' : 'changeGap', { from, to });
  if (!c.until) return { what, until: '' };
  const until =
    c.until === isoDay(day)
      ? t('changeOneDay')
      : t('changeUntil', { date: formatDate(c.until).replace(/\s?\d{4}$/, '') });
  return { what, until };
}

/** "kein Verkehr Am Kupfergraben – Mollstr./Prenzlauer Allee · bis 21.10." */
export function changeText(c: Change, day: string): string {
  const { what, until } = changeParts(c, day);
  return until ? `${what} · ${until}` : what;
}

/** The lines, each once, in the file's order: "M2, M5, M8". */
export function changedLines(list: Change[]): string[] {
  return [...new Set(list.map((c) => c.line))];
}

/** The notice's line list: up to three names, then "+N" for the rest. */
export function linesText(lines: string[], most = 3): string {
  return lines.length <= most + 1
    ? lines.join(', ')
    : `${lines.slice(0, most).join(', ')} +${lines.length - most}`;
}

/** One line's changes in the box's list. */
export interface LineGroup {
  key: string;
  line: string;
  mode: string;
  items: Change[];
}

/** The changes by line (line and mode), each line once, in the file's order. */
export function byLine(list: Change[]): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  for (const c of list) {
    const key = `${c.mode} ${c.line}`;
    const g = groups.get(key);
    if (g) g.items.push(c);
    else groups.set(key, { key, line: c.line, mode: c.mode, items: [c] });
  }
  return [...groups.values()];
}

/** A ride of the shown connection: its line name and mode. */
export interface Ride {
  name: string;
  mode: string;
}

/**
 * The changes that touch one of the rides: the same line, or the replacement bus named
 * after it (VBB names Ersatzverkehr buses "M17", "U2", "S41").
 */
export function touching(list: Change[], rides: Ride[]): Change[] {
  return list.filter((c) =>
    rides.some(
      (r) => r.name === c.line && (r.mode === c.mode || (c.replacement && r.mode === 'bus')),
    ),
  );
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
  /** The file arrived (after a card may already show a connection). */
  loaded?: () => void;
}

export function initChanges({ map, state, dataBase, loaded }: ChangesDeps) {
  const box = $('changes');
  const chip = $<HTMLButtonElement>('changes-chip');
  const panel = $('changes-panel');
  const list = $<HTMLUListElement>('changes-list');
  const menuDialog = $<HTMLDialogElement>('menu');
  const menuBtn = $<HTMLButtonElement>('changes-btn');
  let file: ChangesFile | null = null;
  let loading = false;
  /** The file could not be had: the entry goes, an open box says so. */
  let failed = false;
  /**
   * The open box: what it lists, on which day, and the ride it was opened for from the
   * trip card (null: from Mehr, the whole day). Null while closed. `early`: opened from Mehr
   * before the file was in, so the box waits for it and then says if all runs as usual.
   */
  let opened: { day: string; ride: Ride | null; early?: boolean } | null = null;
  /** The list folds to one line while a stretch is on the map; a tap on it unfolds it. */
  let folded = false;
  let shown: Change | null = null;
  /** The entries the list shows, for its taps. */
  let listed: Change[] = [];
  /** The whole day's list keeps one row per line; these lines are unfolded. */
  let unfolded = new Set<string>();

  const allToday = () => (isDate(state.when.day) ? (file?.days[state.when.day] ?? []) : []);
  function items(): Change[] {
    if (!opened) return [];
    const all = allToday();
    return opened.ride ? touching(all, [opened.ride]) : all;
  }

  let fetching = false;
  function fetchFile() {
    if (file || fetching) return;
    fetching = true;
    fetch(dataUrl(dataBase, 'changes.json'))
      .then((r) => (r.ok ? (r.json() as Promise<ChangesFile>) : null))
      .catch(() => null)
      .then((f) => {
        if (f?.version === 1) file = f;
        else failed = true;
        render();
        loaded?.();
      });
  }

  /** `now`: Mehr's entry was tapped, so fetch at once instead of when the browser is idle. */
  function load(now = false) {
    if (now) return fetchFile();
    if (file || loading) return;
    loading = true;
    // When the browser is idle; the routing runs in the worker meanwhile.
    if ('requestIdleCallback' in window) requestIdleCallback(fetchFile, { timeout: 2000 });
    else setTimeout(fetchFile, 300);
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
        // Clear of the header and of everything at the bottom, the box included.
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

  /**
   * Mehr's entry: the day's lines, or that all runs as usual; hidden without a dated day.
   * It is there from the start, so it never pops in while Mehr is open: until the file is
   * in it reads "Heute anders als sonst", and a tap opens the box with a loading line.
   */
  function renderMenu() {
    const all = allToday();
    menuBtn.hidden = failed || !isDate(state.when.day);
    if (menuBtn.hidden) return;
    const label = noticeDay(state.when.day);
    menuBtn.disabled = !!file && !all.length;
    menuBtn.classList.toggle('pending', !file);
    menuBtn.textContent = !file
      ? t('changesTitle', { day: label })
      : all.length
        ? t('changesChip', { day: label, lines: linesText(changedLines(all)) })
        : t('changesNone', { day: label });
  }

  /** The box opened early, before the file: loading, or nothing to list after all. */
  function renderWaiting(label: string) {
    chip.hidden = true;
    panel.hidden = false;
    $('changes-title').textContent = t(file ? 'changesNone' : 'changesTitle', { day: label });
    $('changes-note').textContent = file ? '' : t(failed ? 'changesFailed' : 'changesLoading');
    list.innerHTML = '';
    listed = [];
  }

  function render() {
    renderMenu();
    // Another day shown: the box was about the old one.
    if (opened && opened.day !== state.when.day) opened = null;
    const day = state.when.day;
    const now = items();
    // Opened early: it waits for the file, then lists the day or says all runs as usual.
    const waiting = !!opened?.early && !now.length;
    if (!now.length && !waiting) opened = null;
    box.hidden = !opened;
    if (!opened) {
      folded = false;
      if (shown) draw(null);
      return;
    }
    if (waiting) {
      if (shown) draw(null);
      folded = false;
      renderWaiting(noticeDay(day));
      return;
    }
    if (shown && !now.includes(shown)) draw(null);
    if (!shown) folded = false;
    // With a stretch on the map the box folds to its line; tapped, it opens the list again.
    chip.textContent = shown ? `${shown.line}: ${changeText(shown, day)}` : '';
    chip.classList.toggle('picked', !!shown);
    chip.setAttribute('aria-expanded', String(!folded));
    chip.hidden = !folded;
    panel.hidden = folded;
    if (folded) return;
    const label = noticeDay(day);
    $('changes-title').textContent = opened.ride
      ? t('changesLineTitle', { line: opened.ride.name, day: label })
      : t('changesTitle', { day: label });
    $('changes-note').textContent = t('changesNote');
    listed = now;
    const badge = (c: { line: string; mode: string }) =>
      `<span class="line-badge" style="background:${MODE_COLORS[c.mode] ?? '#444'}">${escapeHtml(c.line)}</span>`;
    // A one-line row cuts the stretch short, never the end date.
    const text = (c: Change) => {
      const { what, until } = changeParts(c, day);
      return `<span class="what">${escapeHtml(what)}</span>${until ? `<span class="until">· ${escapeHtml(until)}</span>` : ''}`;
    };
    const entry = (c: Change, cls = '') =>
      `<li><button type="button"${cls} data-i="${now.indexOf(c)}" aria-pressed="${c === shown}">${badge(c)} ${text(c)}</button></li>`;
    // From the trip card: that line's entries in full. The whole day: one row per line, so
    // a long day stays short; a line with several changes unfolds on a tap.
    list.innerHTML = opened.ride
      ? now.map((c) => entry(c)).join('')
      : byLine(now)
          .map((g) => {
            if (g.items.length === 1) return entry(g.items[0], ' class="one"');
            const open = unfolded.has(g.key);
            const head = `<li><button type="button" class="group" data-g="${escapeHtml(g.key)}" aria-expanded="${open}">${badge(g)} <span>${escapeHtml(t('changesCount', { n: g.items.length }))}</span></button>`;
            return open
              ? `${head}<ul class="changes-sub">${g.items.map((c) => entry(c)).join('')}</ul></li>`
              : `${head}</li>`;
          })
          .join('');
  }

  function open(ride: Ride | null) {
    if (shown) draw(null);
    opened = { day: state.when.day, ride, early: !file };
    folded = false;
    unfolded = new Set();
    render();
  }

  function close() {
    opened = null;
    render();
  }

  menuBtn.addEventListener('click', () => {
    menuDialog.close();
    load(true);
    open(null);
  });
  chip.addEventListener('click', () => {
    folded = false;
    render();
  });
  list.addEventListener('click', (e) => {
    const g = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-g]');
    if (g) {
      const key = g.dataset.g ?? '';
      if (!unfolded.delete(key)) unfolded.add(key);
      render();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b) return;
    const c = listed[Number(b.dataset.i)] ?? null;
    if (c === shown) return;
    // The list folds to one line so the map shows the stretch.
    folded = true;
    shown = c;
    render();
    draw(c);
    render();
  });
  $('changes-close').addEventListener('click', close);
  renderMenu();

  return {
    /**
     * The note for a ride of the shown connection, "U2: Ersatzverkehr Pankow – Alexanderplatz",
     * or null when its line runs as usual on the shown date.
     */
    noteFor(ride: Ride): string | null {
      const c = touching(allToday(), [ride])[0];
      return c ? `${c.line}: ${changeText(c, state.when.day)}` : null;
    },
    /** A change note on the trip card was tapped: the box with that line's changes. */
    openFor(ride: Ride) {
      open(ride);
    },
    /** A connection is shown (its rides) or closed (null): a box opened from its card follows. */
    focus(rides: Ride[] | null) {
      const r = opened?.ride;
      if (r && !rides?.some((x) => x.name === r.name && x.mode === r.mode)) close();
    },
    isOpen: () => !!opened,
    close,
    /** The shown day changed, or the language; loads the file the first time. */
    update() {
      // Not before the first timetable is in: the map comes first.
      if (Object.keys(state.info).length) load();
      render();
    },
  };
}
