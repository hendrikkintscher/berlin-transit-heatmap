import { describe, expect, it } from 'vitest';
import { byLine, changedLines, changeText, linesText, touching, type Change } from './changes';

const change = (c: Partial<Change>): Change => ({
  line: 'M2',
  mode: 'tram',
  kind: 'gap',
  replacement: false,
  from: 'Am Kupfergraben (Berlin)',
  to: 'Mollstr./Prenzlauer Allee (Berlin)',
  until: '2026-10-21',
  path: [],
  gone: [1, 2],
  ...c,
});

describe('what is different today', () => {
  it('says what does not run, between which stations and until when', () => {
    expect(changeText(change({}), '20261012')).toBe(
      'kein Verkehr Am Kupfergraben – Mollstr./Prenzlauer Allee · bis 21.10.',
    );
    expect(
      changeText(
        change({
          line: 'U2',
          replacement: true,
          from: 'S+U Pankow (Berlin)',
          to: 'U Alexanderplatz (Berlin)',
          until: '2026-10-20',
        }),
        '20261012',
      ),
    ).toBe('Ersatzverkehr Pankow – Alexanderplatz · bis 20.10.');
  });

  it('knows lines that do not run, skipped stations and one-day changes', () => {
    expect(changeText(change({ kind: 'off', until: undefined }), '20261012')).toBe('fährt nicht');
    expect(
      changeText(
        change({ kind: 'skip', from: 'U Oranienburger Tor (Berlin)', until: '2026-10-12' }),
        '20261012',
      ),
    ).toBe('hält nicht an Oranienburger Tor · nur an diesem Tag');
  });

  it('names each line once', () => {
    expect(changedLines([change({}), change({}), change({ line: '37' })])).toEqual(['M2', '37']);
  });

  it('picks the changes on the lines of a connection, replacement buses included', () => {
    const list = [
      change({}),
      change({ line: 'S41', mode: 'sbahn' }),
      change({ line: 'M17', replacement: true }),
      change({ line: 'U2', mode: 'ubahn' }),
    ];
    const rides = [
      { name: 'M2', mode: 'tram' },
      // A bus named after a line without Ersatzverkehr is just a bus.
      { name: 'S41', mode: 'bus' },
      // The Ersatzverkehr bus of the M17.
      { name: 'M17', mode: 'bus' },
    ];
    expect(touching(list, rides).map((c) => c.line)).toEqual(['M2', 'M17']);
  });

  it('shortens long line lists', () => {
    expect(linesText(['M2', 'S3', 'U2', 'M5'])).toBe('M2, S3, U2, M5');
    expect(linesText(['M2', 'S3', 'U2', 'M5', 'M8'])).toBe('M2, S3, U2 +2');
  });

  it("groups the day by line, each line once in the file's order", () => {
    const a = change({ line: 'M5' });
    const b = change({ line: 'M2' });
    const c = change({ line: 'M5', kind: 'skip' });
    const d = change({ line: 'M5', mode: 'bus' });
    const groups = byLine([a, b, c, d]);
    expect(groups.map((g) => [g.line, g.mode, g.items.length])).toEqual([
      ['M5', 'tram', 2],
      ['M2', 'tram', 1],
      ['M5', 'bus', 1],
    ]);
    expect(groups[0].items).toEqual([a, c]);
  });
});
