import { describe, expect, it } from 'vitest';
import { leaveText, tripHtml, type Trip, type TripContext } from './trip-card';

const ctx: TripContext = {
  direction: 'depart',
  now: null,
};
const ride = (name: string, mode: string, from: string, to: string) =>
  ({ type: 'ride', name, mode, from, to, stops: 3 }) as const;

describe('trip card', () => {
  it('details each ride with its times and the wait at a change', () => {
    const html = tripHtml(
      {
        journeys: [
          {
            transfers: 1,
            legs: [
              { type: 'walk', minutes: 2 },
              {
                ...ride('S7', 'sbahn', 'S Ostkreuz Bhf (Berlin)', 'S Warschauer Str. (Berlin)'),
                dep: 36_120,
                arr: 36_300,
                passed: [],
              },
              { type: 'walk', minutes: 3 },
              {
                ...ride('U1', 'ubahn', 'U Warschauer Str. (Berlin)', 'U Kottbusser Tor (Berlin)'),
                dep: 36_780,
                arr: 37_200,
                passed: [
                  { name: 'U Schlesisches Tor (Berlin)', at: 36_900 },
                  { name: 'U Görlitzer Bahnhof (Berlin)', at: 37_020 },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );
    expect(html).toContain('<time>10:02</time><span>S Ostkreuz Bhf</span>');
    expect(html).toContain('ohne Halt · 3 Min.');
    // 10:05 off, 10:13 on: 3 minutes walking, 5 waiting.
    expect(html).toContain('<li class="tl-change">Umstieg · 3 Min. Fußweg · 5 Min. warten</li>');
    expect(html).toContain('<summary>2 Stationen · 7 Min.</summary>');
    expect(html).toContain('<time>10:15</time><span>U Schlesisches Tor</span>');
    // The stops line gives way to the timeline.
    expect(html).not.toContain('class="stops"');
  });

  it('names the hour average under Typisch only when it differs from the trip', () => {
    const trip = (avg: number) =>
      tripHtml(
        {
          journeys: [
            {
              transfers: 0,
              leave: 36_000,
              arrive: 36_000 + 17 * 60,
              legs: [ride('U8', 'ubahn', 'U Alexanderplatz', 'U Hermannplatz')],
            },
          ],
        },
        { ...ctx, avg },
      );
    expect(trip(19)).toContain('Ø 19 Min.');
    expect(trip(18)).not.toContain('trip-avg');
  });

  it('names where the trip starts and ends, the place by its own name', () => {
    const journey = {
      transfers: 0,
      legs: [
        ride('S7', 'sbahn', 'S Ostkreuz Bhf (Berlin)', 'S+U Zoologischer Garten Bhf (Berlin)'),
      ],
      ends: ['S Ostkreuz Bhf', 'S+U Zoologischer Garten Bhf'] as [string, string],
    };
    expect(tripHtml({ journeys: [journey] }, ctx)).toContain(
      '<small class="trip-ends">Ostkreuz → Zoologischer Garten</small>',
    );
    // Arriving, the tapped place is where the trip starts.
    expect(
      tripHtml({ journeys: [journey] }, { ...ctx, direction: 'arrive', place: 'Kino' }),
    ).toContain('<small class="trip-ends">Kino → Zoologischer Garten</small>');
  });

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
    expect(html).toContain(
      '1 Umstieg · 8 Min. Fußweg<span class="stops"> · Moritzplatz → Hermannplatz → Rudow</span>',
    );
    expect(html).not.toContain('google');
    expect(html).not.toContain('<i class="p1">');
  });

  it('notes what runs differently today on a line of the connection, once', () => {
    const html = tripHtml(
      {
        journeys: [
          {
            transfers: 1,
            legs: [
              ride('U2', 'ubahn', 'U Pankow (Berlin)', 'U Alexanderplatz (Berlin)'),
              ride('U8', 'ubahn', 'U Alexanderplatz (Berlin)', 'U Hermannplatz (Berlin)'),
            ],
          },
        ],
      },
      {
        ...ctx,
        changeNote: (r) => (r.name === 'U2' ? 'U2: Ersatzverkehr Pankow – Senefelderplatz' : null),
      },
    );
    expect(html.match(/trip-change/g)).toHaveLength(1);
    expect(html).toContain(
      '<small class="trip-change">U2: Ersatzverkehr Pankow – Senefelderplatz</small>',
    );
  });

  it('marks two journeys and says when there is none', () => {
    const html = tripHtml(
      { journeys: [null, { transfers: 0, legs: [{ type: 'walk', minutes: 12, bike: true }] }] },
      ctx,
    );
    expect(html).toContain('<i class="p1"></i>Keine Verbindung gefunden');
    expect(html).toContain('<i class="p2"></i>');
    expect(html).toContain('12 Min. Rad');
    expect(html).not.toContain('google');
  });

  it('folds a meeting point\'s other trips behind "N weitere Fahrten"', () => {
    const j = { transfers: 0, legs: [ride('U2', 'ubahn', 'A', 'B')] };
    const html = tripHtml({ journeys: [j, j, null] }, ctx);
    expect(html).toContain(
      '<details class="trip-more"><summary>2 weitere Fahrten</summary><span class="trip-head',
    );
    expect(html).toContain('<span class="trip-sum"><i class="p2">');
    expect(html.indexOf('<i class="p1">')).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('<i class="p3"></i>Keine Verbindung gefunden</span></details>');
    expect(tripHtml({ journeys: [j, j] }, ctx)).toContain('<summary>1 weitere Fahrt</summary>');
    expect(tripHtml({ journeys: [j] }, ctx)).not.toContain('details');
  });

  it('makes the summary the button that opens the detailed connection', () => {
    const j = { transfers: 0, legs: [ride('U2', 'ubahn', 'A', 'B')] };
    const html = tripHtml({ journeys: [j] }, ctx);
    expect(html).toMatch(
      /^<span class="trip-head opens" role="button" tabindex="0" aria-expanded="false"/,
    );
    // The summary ends before the stops list it opens.
    expect(html.indexOf('</small></span>')).toBeGreaterThan(html.indexOf('trip-stops'));
    const walkOnly = tripHtml(
      { journeys: [{ transfers: 0, legs: [{ type: 'walk', minutes: 9 }] }] },
      ctx,
    );
    expect(walkOnly).toContain('<span class="trip-head">');
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

  it('leads with the connection minutes and arrival, then when to leave', () => {
    const html = tripHtml(
      {
        journeys: [
          {
            transfers: 0,
            legs: [ride('M41', 'bus', 'A', 'B')],
            leave: 10 * 3600 + 5 * 60,
            arrive: 10 * 3600 + 23 * 60,
          },
        ],
      },
      { ...ctx, now: 10 * 3600 },
    );
    expect(html).toContain('18 Min. · an 10:23 Uhr');
    expect(html).toContain('los in 5 Min.');
  });

  it('says jetzt los, counts down, or names the time on another day', () => {
    expect(leaveText(36000, 35990)).toBe('jetzt los');
    expect(leaveText(36000, 35000)).toBe('los in 16 Min.');
    expect(leaveText(36000, null)).toBe('los um 10:00 Uhr');
    expect(leaveText(36000, 30000)).toBe('los um 10:00 Uhr');
    // An hour earlier today: gone, so no "jetzt los".
    expect(leaveText(30000, 36000)).toBe('los um 08:20 Uhr');
  });
});
