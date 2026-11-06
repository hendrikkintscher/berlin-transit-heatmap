import { describe, expect, it } from 'vitest';
import { altState } from './alt-state';
import type { FromWorker } from './protocol';

type Trip = Extract<FromWorker, { type: 'trip' }>;
type Alt = Extract<FromWorker, { type: 'tripAlt' }>;

const trip = (id: number): Trip => ({
  type: 'trip',
  id,
  journeys: [],
  lines: { type: 'FeatureCollection', features: [] },
  stops: { type: 'FeatureCollection', features: [] },
});
const message: Alt = {
  type: 'tripAlt',
  id: 7,
  trip: trip(0),
  where: 'end',
  line: '200',
  stop: 'J',
  saved: 10,
};

describe('altState (S045)', () => {
  it('shows nothing without an alternative', () => {
    const a = altState();
    expect(a.html(0)).toBe('');
    expect(a.toggle(trip(7))).toBeNull();
  });

  it('offers the ride on the first connection only', () => {
    const a = altState();
    a.set(message);
    expect(a.html(0)).toContain('oder 200 bis J');
    expect(a.html(2)).toBe('');
  });

  it('swaps to the ride, offers the way back and swaps again', () => {
    const a = altState();
    a.set(message);
    const own = trip(7);
    expect(a.toggle(own)).toMatchObject({ type: 'trip', id: 7 });
    expect(a.shown).toBe(true);
    // The way back shows whichever connection the card is on.
    expect(a.html(3)).toContain('oder zu Fuß');
    expect(a.toggle(own)).toBe(own);
    expect(a.shown).toBe(false);
  });

  it('is gone with the trip it belonged to, and when the drawer picks another row', () => {
    const a = altState();
    a.set(message);
    a.toggle(trip(7));
    a.back();
    expect(a.shown).toBe(false);
    expect(a.html(0)).toContain('oder 200 bis J');
    a.reset();
    expect(a.html(0)).toBe('');
    expect(a.toggle(trip(7))).toBeNull();
  });
});
