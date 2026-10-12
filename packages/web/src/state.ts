// The app's settings and what is on the map, shared by main.ts and the modules it wires up.

import type { FromWorker, Measure, TimetableInfo, Travel, Window } from './protocol';
import { DEFAULT_WALK_KMH, TRAVELS, walkSpeed, type Point } from './url';
import { whenAt, windowName, type Direction, type When } from './when';

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Small per-device settings and "hint seen" flags; storage may be blocked. */
export function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
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
export const DEFAULT_OPACITY = 80;

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

export function createState(): State {
  return {
    when: NOW_WHEN,
    window: windowName(NOW_WHEN),
    direction: 'depart',
    measure: 'next',
    measureBefore: null,
    compare: null,
    origin: null,
    others: [],
    special: null,
    requestId: 0,
    info: {},
    routes: true,
    freq: false,
    desert: false,
    iso: true,
    heat: false,
    limit: 0,
    opacity: readNumber('heat-opacity', DEFAULT_OPACITY),
    walkKmh: walkSpeed(readNumber('walk-kmh', DEFAULT_WALK_KMH)),
    stepFree: readNumber('step-free', 0) > 0,
    travel: TRAVELS[readNumber('travel', 0)] ?? 'walk',
    status: () => '',
    result: null,
    layers: {},
    mapReady: false,
  };
}
