import { describe, expect, it } from 'vitest';
import { tripHtml, type Trip, type TripContext } from './trip-card';

const ctx: TripContext = {
  starts: [{ lat: 52.5037, lon: 13.4108 }],
  here: { lat: 52.43915, lon: 13.47215 },
  direction: 'depart',
  travel: 'walk',
};
const ride = (name: string, mode: string, from: string, to: string) =>
  ({ type: 'ride', name, mode, from, to, stops: 3 }) as const;

describe('trip card', () => {
  it('lists the lines, changes, walking and stops', () => {
    const html = tripHtml(
      {
        journeys: [
          {
            transfers: 1,
            legs: [
              { type: 'walk', minutes: 3 },
              ride('U8', 'ubahn', 'U Moritzplatz (Berlin)', 'U Hermannplatz (Berlin)'),
              ride('U7', 'ubahn', 'U Hermannplatz (Berlin)', 'U Rudow (Berlin)'),
              { type: 'walk', minutes: 5 },
            ],
          },
        ],
      },
      ctx,
    );
    expect(html).toContain('>U8</span><span class="trip-sep">›</span><span');
    expect(html).toContain('1 Umstieg · 8 Min. Fußweg · Moritzplatz → Hermannplatz → Rudow');
    expect(html).toContain('origin=52.50370,13.41080&destination=52.43915,13.47215');
    expect(html).not.toContain('<i class="p1">');
  });

  it('marks two journeys and says when there is none', () => {
    const html = tripHtml(
      { journeys: [null, { transfers: 0, legs: [{ type: 'walk', minutes: 12, bike: true }] }] },
      { ...ctx, starts: [ctx.starts[0], null] },
    );
    expect(html).toContain('<i class="p1"></i>Keine Verbindung gefunden');
    expect(html).toContain('<i class="p2"></i>');
    expect(html).toContain('12 Min. Rad');
    // No second start known: no Google link for it.
    expect(html.match(/trip-link/g)).toBeNull();
  });

  it('gives the minutes of a connection leaving now', () => {
    const j: Trip['journeys'][number] = {
      transfers: 0,
      minutes: 17,
      legs: [{ type: 'walk', minutes: 4 }],
    };
    expect(tripHtml({ journeys: [j] }, ctx)).toContain(
      '<span class="trip-now">Nächste Verbindung: 17 Min.</span>',
    );
    const two = tripHtml({ journeys: [j, j] }, { ...ctx, direction: 'arrive' });
    expect(two).toContain('<span class="trip-now"><i class="p2"></i>Letzte Verbindung');
    expect(two).not.toContain('<span class="trip-sum"><i');
  });

  it('turns the link around when arriving', () => {
    const html = tripHtml(
      { journeys: [{ transfers: 0, legs: [{ type: 'walk', minutes: 4 }] }] },
      { ...ctx, direction: 'arrive', travel: 'bikeonly' },
    );
    expect(html).toContain('origin=52.43915,13.47215&destination=52.50370,13.41080');
    expect(html).toContain('travelmode=bicycling');
  });
});
