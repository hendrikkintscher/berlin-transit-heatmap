// The feeder ride next to the shown trip (S045): what the card keeps of it, and when its line shows.
import type { FromWorker } from './protocol';
import { tripAltHtml } from './trip-card';

type Trip = Extract<FromWorker, { type: 'trip' }>;
type Alt = Extract<FromWorker, { type: 'tripAlt' }>;

/** The alternative of the trip on the card and whether the card shows it now. */
export function altState() {
  let alt: (Omit<Alt, 'trip'> & { trip: Trip }) | null = null;
  let shown = false;
  return {
    /** A new trip is on its way (or on the card): the alternative of the one before is gone. */
    reset() {
      alt = null;
      shown = false;
    },
    /** The worker found one for trip `id`. */
    set(m: Alt) {
      alt = { ...m, trip: { ...m.trip, type: 'trip', id: m.id } };
      shown = false;
    },
    /** The card goes back to the trip itself (another row of the drawer was picked). */
    back() {
      shown = false;
    },
    get shown() {
      return shown;
    },
    /** Swaps the card; the trip to put on it, or null without an alternative. */
    toggle(own: Trip): Trip | null {
      if (!alt) return null;
      shown = !shown;
      return shown ? alt.trip : own;
    },
    /** The line under the trip: only on the first connection, or while the ride is shown. */
    html(shownConnection: number): string {
      if (!alt || (!shown && shownConnection !== 0)) return '';
      return tripAltHtml(alt, shown);
    },
  };
}
