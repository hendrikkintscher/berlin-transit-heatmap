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

export interface State {
  /** Weekday or weekend, and the departure hour; `window` names its timetable file. */
  when: When;
  window: Window;
  /** Leave in the chosen hour, or arrive in it. */
  direction: Direction;
  /** Typical (averaged over the hour, waiting included) or best-case minutes. */
  measure: Measure;
  /** Compare: a second time; the map then shows how much longer trips take then. */
  compare: When | null;
  origin: Point | null;
  /** Meeting point: the second person's start. */
  second: Point | null;
  requestId: number;
  info: Partial<Record<Window, TimetableInfo>>;
  routes: boolean;
  /** Stop-frequency dots and transit-desert shading. */
  freq: boolean;
  desert: boolean;
  /** Isochrone outlines at 15/30/45 min. */
  iso: boolean;
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
    measure: 'typical',
    compare: null,
    origin: null,
    second: null,
    requestId: 0,
    info: {},
    routes: true,
    freq: false,
    desert: false,
    iso: false,
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
