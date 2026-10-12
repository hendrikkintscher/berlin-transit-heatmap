// What a link carries: ?from=lat,lon&with=…[&with=…]&to=…&t=weekend-02&dir=arr&m=best&cmp=…
// &walk=5&sf=1&go=bike&routes=0&layers=heat,freq,desert,noiso&lang=en. Reading a link only
// changes what it names; the rest keeps the device's own settings. An exact time adds its
// minutes to t (t=20261014-0835).

import type { Measure, Travel } from './protocol';
import {
  parseWhen,
  whenFromParams,
  whenParam,
  windowName,
  type Direction,
  type When,
} from './when';

/** Walking speeds offered in the menu, in km/h; 5 is the default (close to BVG and Google). */
export const WALK_SPEEDS = [3, 4, 5, 6];
export const DEFAULT_WALK_KMH = 5;
export const walkSpeed = (v: number) => (WALK_SPEEDS.includes(v) ? v : DEFAULT_WALK_KMH);
/** Ways of getting around, in menu order (stored by index on the device). */
export const TRAVELS: Travel[] = ['walk', 'bike', 'bikeonly'];
export const travelOf = (v: string | null): Travel =>
  TRAVELS.includes(v as Travel) ? (v as Travel) : 'walk';

/** A meeting point has up to this many starts: the first and four more. */
export const MAX_STARTS = 5;

/**
 * The app opens on "Nächste"; a meeting point (two or more starts) on "Typisch", which is
 * fairer to compare when nobody knows when the others leave.
 */
export const defaultMeasure = (s: { others: Point[] }): Measure =>
  s.others.length ? 'typical' : 'next';

export interface Point {
  lat: number;
  lon: number;
}

export interface LinkState {
  origin: Point | null;
  /** Meeting point: the other people's starts (up to four). */
  others: Point[];
  /** The tapped place, kept through settings changes. */
  to: Point | null;
  when: When;
  direction: Direction;
  measure: Measure;
  compare: When | null;
  walkKmh: number;
  stepFree: boolean;
  travel: Travel;
  routes: boolean;
  freq: boolean;
  desert: boolean;
  iso: boolean;
  heat: boolean;
}

export function parsePoint(v: string | null): Point | null {
  const [lat, lon] = (v ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? { lat, lon } : null;
}
export const pointParam = (o: Point) => `${o.lat.toFixed(5)},${o.lon.toFixed(5)}`;

/** The state a link describes, on top of `base` (the device's settings and the current hour). */
export function readLink(search: string, base: LinkState): LinkState {
  const p = new URLSearchParams(search);
  const s = { ...base };
  if (p.get('routes') === '0') s.routes = false;
  const layers = (p.get('layers') ?? '').split(',');
  s.freq = layers.includes('freq');
  s.desert = layers.includes('desert');
  s.iso = !layers.includes('noiso');
  s.heat = layers.includes('heat');
  s.origin = parsePoint(p.get('from'));
  s.others = s.origin
    ? p
        .getAll('with')
        .map(parsePoint)
        .filter((o): o is Point => o !== null)
        .slice(0, MAX_STARTS - 1)
    : [];
  s.to = s.origin ? parsePoint(p.get('to')) : null;
  s.when = whenFromParams(p, base.when);
  if (p.get('dir') === 'arr') s.direction = 'arrive';
  const m = p.get('m');
  s.measure = m === 'typical' || m === 'best' || m === 'next' ? m : defaultMeasure(s);
  // An exact time is always "Nächste".
  if (s.when.minute !== undefined) s.measure = 'next';
  s.compare = parseWhen(p.get('cmp'));
  if (p.has('walk')) s.walkKmh = walkSpeed(Number(p.get('walk')));
  if (p.has('sf')) s.stepFree = p.get('sf') === '1';
  if (p.has('go')) s.travel = travelOf(p.get('go'));
  return s;
}

/**
 * The query string for `s`, without what is the default anyway; the time is left out when
 * it is `now` (the hour the map opens at). `lang` is kept when given, so a shared English
 * link stays English.
 */
export function linkQuery(s: LinkState, now: When, lang?: string | null): string {
  const p = new URLSearchParams();
  if (s.origin) p.set('from', pointParam(s.origin));
  for (const o of s.others) p.append('with', pointParam(o));
  if (s.to) p.set('to', pointParam(s.to));
  if (whenParam(s.when) !== windowName(now)) p.set('t', whenParam(s.when));
  if (s.direction === 'arrive') p.set('dir', 'arr');
  if (s.measure !== defaultMeasure(s)) p.set('m', s.measure);
  if (s.compare) p.set('cmp', windowName(s.compare));
  if (s.walkKmh !== DEFAULT_WALK_KMH) p.set('walk', String(s.walkKmh));
  if (s.stepFree) p.set('sf', '1');
  if (s.travel !== 'walk') p.set('go', s.travel);
  if (!s.routes) p.set('routes', '0');
  const layers = [s.heat && 'heat', s.freq && 'freq', s.desert && 'desert', !s.iso && 'noiso']
    .filter(Boolean)
    .join(',');
  if (layers) p.set('layers', layers);
  if (lang) p.set('lang', lang);
  return p.toString();
}
