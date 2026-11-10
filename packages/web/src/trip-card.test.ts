import { describe, expect, it } from 'vitest';
import {
  accessUnknownHtml,
  leaveText,
  longWalkHtml,
  tripAltHtml,
  tripHtml,
  type Trip,
  type TripContext,
} from './trip-card';

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

  it("shows the map's place by the rings on its dot, the other dot as the slot", () => {
    const journey = {
      transfers: 0,
      legs: [
        ride('S7', 'sbahn', 'S Ostkreuz Bhf (Berlin)', 'S+U Zoologischer Garten Bhf (Berlin)'),
      ],
      ends: ['S Ostkreuz Bhf', 'S+U Zoologischer Garten Bhf'] as [string, string],
    };
    // Each row as its class, what leads it (the rings, or the slot with a plain dot) and
    // what ends it: nothing after the name any more.
    const rows = (direction: TripContext['direction']) =>
      [
        ...tripHtml(
          { journeys: [journey] },
          { ...ctx, direction, rows: { anchorTitle: 'Hier rechnet die Karte' } },
        ).matchAll(
          /<span class="(trip-row [^"]*)">(.*?)<small class="role">.*?<\/small><span class="name">([^<]*)<\/span><\/span>/g,
        ),
      ].map(([, cls, lead, name]) => [
        cls,
        lead.startsWith('<i class="rings"')
          ? 'rings'
          : lead === '<span class="anchor-slot"><i class="dot"></i></span>'
            ? 'dot'
            : lead,
        name,
      ]);
    // Leaving: the map is computed from the Start.
    expect(rows('depart')).toEqual([
      ['trip-row start anchor', 'rings', 'Ostkreuz'],
      ['trip-row end', 'dot', 'Zoologischer Garten'],
    ]);
    // Arriving (after ⇅ or the rings moved): the rings sit on the Ziel's dot.
    expect(rows('arrive')).toEqual([
      ['trip-row start', 'dot', 'Ostkreuz'],
      ['trip-row end anchor', 'rings', 'Zoologischer Garten'],
    ]);
    expect(
      tripHtml(
        { journeys: [journey] },
        { ...ctx, rows: { anchorTitle: 'Hier rechnet die Karte' } },
      ),
    ).toContain('<i class="rings" role="img" aria-label="Hier rechnet die Karte"');
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
      '<small class="trip-change" role="button" tabindex="0" data-line="U2" data-mode="ubahn">U2: Ersatzverkehr Pankow – Senefelderplatz</small>',
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

  it('names the minute the trip arrives by, as the Zeit panel does', () => {
    const html = tripHtml(
      {
        journeys: [
          {
            transfers: 0,
            legs: [ride('M41', 'bus', 'A', 'B')],
            leave: 10 * 3600 + 5 * 60,
            arrive: 10 * 3600 + 23 * 60 + 30,
          },
        ],
      },
      { ...ctx, now: 10 * 3600 },
    );
    expect(html).toContain('an 10:24 Uhr');
  });

  it('says jetzt los, counts down, or names the time on another day', () => {
    expect(leaveText(36000, 35990)).toBe('jetzt los');
    expect(leaveText(36000, 35000)).toBe('los in 16 Min.');
    expect(leaveText(36000, null)).toBe('los um 10:00 Uhr');
    expect(leaveText(36000, 30000)).toBe('los um 10:00 Uhr');
    // An hour earlier today: gone, so no "jetzt los".
    expect(leaveText(30000, 36000)).toBe('los um 08:20 Uhr');
  });

  it('says so when a walk at either end is over 15 minutes', () => {
    const walk = (minutes: number, bike?: true) => ({ type: 'walk', minutes, bike }) as const;
    const r = ride('M10', 'tram', 'A', 'B');
    expect(longWalkHtml([walk(15), r, walk(3)])).toBe('');
    expect(longWalkHtml([walk(16), r, walk(3)])).toContain('langer Fußweg am Anfang (16 Min.)');
    expect(longWalkHtml([walk(2), r, walk(22)])).toContain('langer Fußweg am Ende (22 Min.)');
    expect(longWalkHtml([walk(18), r, walk(22)])).toContain('lange Fußwege: 18 + 22 Min.');
    // A long walk at a change is not at an end; cycling and walking all the way neither.
    expect(longWalkHtml([walk(2), r, walk(20), r, walk(2)])).toBe('');
    expect(longWalkHtml([walk(25, true), r])).toBe('');
    expect(longWalkHtml([walk(25)])).toBe('');
    const html = tripHtml({ journeys: [{ transfers: 0, legs: [walk(2), r, walk(24)] }] }, ctx);
    expect(html).toContain('<small class="trip-long-walk">langer Fußweg am Ende (24 Min.)</small>');
  });

  it('names rides of unknown access in step-free mode only (S055)', () => {
    const u = { ...ride('RB24', 'regional', 'A', 'B'), accessUnknown: true as const };
    const legs = [{ type: 'walk', minutes: 2 } as const, u, ride('U8', 'ubahn', 'B', 'C')];
    const trip = { journeys: [{ transfers: 1, legs }] };
    expect(tripHtml(trip, { ...ctx, stepFree: true })).toContain(
      '<small class="trip-access">RB24: barrierefrei nicht bekannt</small>',
    );
    expect(tripHtml(trip, ctx)).not.toContain('trip-access');
    expect(accessUnknownHtml([ride('U8', 'ubahn', 'B', 'C')])).toBe('');
    expect(accessUnknownHtml([u, { ...u }])).toContain('RB24: ');
  });
});

describe('tripAltHtml (S045)', () => {
  const alt = { where: 'start' as const, line: '115', stop: 'Teltower Damm', saved: 14 };
  it('names the ride, its stop and the same arrival', () => {
    const html = tripAltHtml(alt, false);
    expect(html).toContain('class="trip-alt"');
    expect(html).toContain('oder 115 ab Teltower Damm · gleiche Ankunft, 14 Min. weniger zu Fuß');
  });
  it('says "bis" for a shorter walk at the end, and offers the walk back on the ride', () => {
    expect(tripAltHtml({ ...alt, where: 'end' }, false)).toContain('oder 115 bis Teltower Damm');
    expect(tripAltHtml(alt, true)).toContain('oder zu Fuß · gleiche Ankunft, 14 Min. mehr zu Fuß');
  });
  it('escapes the stop name', () => {
    expect(tripAltHtml({ ...alt, stop: '<b>' }, false)).not.toContain('<b>');
  });
});
