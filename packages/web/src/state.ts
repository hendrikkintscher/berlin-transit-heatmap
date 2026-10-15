// The app's settings and what is on the map, shared by main.ts and the modules it wires up.

import { DEFAULT_BBOX } from '@berlin-transit-heatmap/routing';
import type { FromWorker, Measure, TimetableInfo, ToWorker, Travel, Window } from './protocol';
import { DEFAULT_WALK_KMH, readLink, TRAVELS, walkSpeed, type Point } from './url';
import { computeWindow, leaveOffset, whenAt, windowName, type Direction, type When } from './when';

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Small per-device settings and "hint seen" flags; storage may be blocked. */
export function readNumber(key: string, fallback: number): number {
  try {
    return storedNumber(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}
const storedNumber = (stored: string | null | undefined, fallback: number) => {
  const v = Number(stored);
  return stored != null && Number.isFinite(v) ? v : fallback;
};
/** readNumber over settings read before (STATE_KEYS, as the start page hands them on). */
export const readFrom =
  (stored: Record<string, string | null>) =>
  (key: string, fallback: number): number =>
    storedNumber(stored[key], fallback);
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts for this visit only.
  }
}
export const seen = (key: string) => readNumber(`seen-${key}`, 0) > 0;

/** The map opens at the current day type and hour in Berlin, unless a link says otherwise. */
export const NOW_WHEN = whenAt(new Date());
export const DEFAULT_OPACITY = 60;

export type Result = Extract<FromWorker, { type: 'result' }>;
export type Layers = Extract<FromWorker, { type: 'layers' }>;

export type Special = { kind: 'living' } | { kind: 'home'; at: Point; name: string };

export interface State {
  /** Weekday or weekend, and the departure hour; `window` names its timetable file. */
  when: When;
  window: Window;
  /** Leave in the chosen hour, or arrive in it. */
  direction: Direction;
  /** Next connection from now (the default), typical (averaged over the hour, waiting included) or best-case minutes. */
  measure: Measure;
  /**
   * Adding a second start switched to Typisch; this is the choice before it, back when the
   * last other start goes. Null once a choice is made in between.
   */
  measureBefore: Measure | null;
  /** Compare: a second time; the map then shows how much longer trips take then. */
  compare: When | null;
  origin: Point | null;
  /** Meeting point: the other people's starts (up to four). */
  others: Point[];
  /** Meeting point: each start's name, by position ("" for none). */
  names: string[];
  /**
   * A map shown instead of the start's: "where can I live?" from the favourites, or
   * "Bis wann komme ich heim?" to `at` (a start or a favourite, named `name`).
   */
  special: Special | null;
  requestId: number;
  info: Partial<Record<Window, TimetableInfo>>;
  routes: boolean;
  /** Stop-frequency dots and transit-desert shading. */
  freq: boolean;
  desert: boolean;
  /** Isochrone outlines every 5 min; on by default, so the minutes read without colours. */
  iso: boolean;
  /** The coloured travel-time fill; off by default (the outlines carry the minutes). */
  heat: boolean;
  /** "Bis N Min.": shade what is reachable within this many minutes in one colour; 0 = off. */
  limit: number;
  /** Heatmap opacity in percent; remembered on this device. */
  opacity: number;
  /** Walking speed in km/h; remembered on this device, carried in shared links. */
  walkKmh: number;
  /** Step-free journeys only; remembered on this device, carried in shared links. */
  stepFree: boolean;
  /** Walking, cycling to and from stations, or cycling only; remembered, carried in links. */
  travel: Travel;
  /** Re-renders the status line, so it follows a language switch. */
  status: () => string;
  /** The last computed map, for taps, favourites and redrawing. */
  result: Result | null;
  /** Layer data per window, fetched from the worker the first time a layer is shown. */
  layers: Partial<Record<Window, Layers>>;
  mapReady: boolean;
}

/** The state the app starts from: reads the device settings named in STATE_KEYS (early.ts). */
export function createState(read = readNumber, when = NOW_WHEN): State {
  return {
    when,
    window: windowName(when),
    direction: 'depart',
    measure: 'next',
    measureBefore: null,
    compare: null,
    origin: null,
    others: [],
    names: [],
    special: null,
    requestId: 0,
    info: {},
    routes: true,
    freq: false,
    desert: false,
    iso: true,
    heat: false,
    limit: 0,
    opacity: read('heat-opacity', DEFAULT_OPACITY),
    walkKmh: walkSpeed(read('walk-kmh', DEFAULT_WALK_KMH)),
    stepFree: read('step-free', 0) > 0,
    travel: TRAVELS[read('travel', 0)] ?? 'walk',
    status: () => '',
    result: null,
    layers: {},
    mapReady: false,
  };
}

/** A point on the map's area (Berlin, Potsdam and the commuter belt). */
export function inArea({ lat, lon }: Point) {
  const [w, s, e, n] = DEFAULT_BBOX;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/**
 * The app's state as the link and the device's settings give it when the page opens. The
 * worker works it out too, from what the start page hands on, to draw the first map
 * before the app asks for it (see 'boot' in worker.ts).
 */
export function linkState(search: string, read = readNumber, when = NOW_WHEN) {
  const state = createState(read, when);
  const link = readLink(search, { ...state, to: null, span: null });
  Object.assign(state, link, { window: windowName(link.when) });
  // A link's starts outside the area would compute an empty map: they are dropped (and a
  // note says why, once the page is up).
  const starts = state.origin ? [state.origin, ...state.others] : [];
  const outside = starts.some((o) => !inArea(o));
  if (outside) {
    const kept = starts.filter(inArea);
    state.origin = kept[0] ?? null;
    state.others = kept.slice(1);
  }
  if (link.to && (!state.origin || !inArea(link.to))) [link.to, link.span] = [null, null];
  // A meeting-point link on Typisch goes back to "Nächste" without the other starts.
  if (state.others.length && state.measure === 'typical') state.measureBefore = 'next';
  return { state, link, outside };
}

export type ComputeRequest = Omit<Extract<ToWorker, { type: 'compute' }>, 'type' | 'id'>;

/** What the worker needs for the map of `s`'s start(s), leaving `now` on Nächste. */
export function computeRequest(s: State & { origin: Point }, now = new Date()): ComputeRequest {
  return {
    window: computeWindow(s.when, s.direction),
    direction: s.direction,
    measure: s.measure,
    leaveOffset: leaveOffset(s.when, now),
    ...(s.direction === 'arrive' && s.when.minute ? { arriveOffset: s.when.minute * 60 } : {}),
    walkKmh: s.walkKmh,
    ...(s.stepFree ? { stepFree: true } : {}),
    ...(s.travel !== 'walk' ? { travel: s.travel } : {}),
    ...(s.compare ? { compare: computeWindow(s.compare, s.direction) } : {}),
    ...s.origin,
    ...(s.others.length ? { others: s.others } : {}),
    ...(s.heat || s.limit ? {} : { noImage: true as const }),
    ...(s.limit ? { limit: s.limit } : {}),
  };
}

/**
 * Whether `asked` is the map `made` was made for: the same request, leaving at most a
 * minute later (the worker makes the first map before the app asks for it).
 */
export function sameRequest(made: ComputeRequest, asked: ComputeRequest): boolean {
  const { leaveOffset: early = 0, ...a } = made;
  const { leaveOffset: late = 0, ...b } = asked;
  if ('type' in b) delete b.type;
  if ('id' in b) delete b.id;
  return late >= early && late - early <= 60 && JSON.stringify(a) === JSON.stringify(b);
}
