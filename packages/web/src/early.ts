// What the start page needs before the rest of the app: kept small, as the entry loads it.
import type { Travel } from './protocol';
import { computeWindow, whenAt, whenFromParams, type Direction } from './when';

/** Ways of getting around, in menu order (stored by index on the device). */
export const TRAVELS: Travel[] = ['walk', 'bike', 'bikeonly'];
export const travelOf = (v: string | null): Travel =>
  TRAVELS.includes(v as Travel) ? (v as Travel) : 'walk';

/**
 * Whether the link has a start (from=), so the first map needs a timetable right away.
 * Without one nothing needs it before the first tap: it waits until the app has loaded.
 */
export function linkHasStart(search: string): boolean {
  const [lat, lon] = (new URLSearchParams(search).get('from') ?? '').split(',').map(Number);
  return Boolean(lat && lon);
}

/**
 * What the first map will need, known before the app has loaded: the timetable file and how
 * it is prepared (direction, step-free, bikes), from the link and the stored settings
 * ('step-free' and 'travel' in localStorage, null when unset). The same as readLink and the
 * device settings give, so the early load is the one the first map uses.
 */
export function earlyLoad(
  search: string,
  stored: { stepFree: string | null; travel: string | null },
  now = new Date(),
): { window: string; direction: Direction; stepFree: boolean; bike: boolean } {
  const p = new URLSearchParams(search);
  const direction: Direction = p.get('dir') === 'arr' ? 'arrive' : 'depart';
  const stepFree = p.has('sf') ? p.get('sf') === '1' : Number(stored.stepFree) > 0;
  const travel = p.has('go')
    ? travelOf(p.get('go'))
    : (TRAVELS[Number(stored.travel ?? 0)] ?? 'walk');
  return {
    window: computeWindow(whenFromParams(p, whenAt(now), now), direction),
    direction,
    stepFree,
    bike: travel === 'bike',
  };
}
