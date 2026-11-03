import { afterEach, describe, expect, it, vi } from 'vitest';
import { berlinTime, liveStatus, liveText, pickStatus } from './live';

describe('live status of the first vehicle', () => {
  it('turns seconds of a Berlin day into the moment, summer and winter time', () => {
    expect(berlinTime('20261012', 10 * 3600 + 20 * 60).toISOString()).toBe(
      '2026-10-12T08:20:00.000Z',
    );
    expect(berlinTime('20261201', 25 * 3600).toISOString()).toBe('2026-12-02T00:00:00.000Z');
  });

  it("picks the line's departure at the planned time", () => {
    const when = new Date('2026-10-12T08:20:00Z');
    const deps = [
      { line: { name: 'U8' }, plannedWhen: '2026-10-12T10:15:00+02:00', delay: 0 },
      { line: { name: 'U2' }, plannedWhen: '2026-10-12T10:20:00+02:00', delay: 600 },
      { line: { name: 'U8' }, plannedWhen: '2026-10-12T10:20:00+02:00', delay: 240 },
    ];
    expect(pickStatus(deps, 'U8', when)).toEqual({ cancelled: false, delay: 240 });
    expect(pickStatus([{ ...deps[2]!, cancelled: true, delay: null }], 'U8', when)).toEqual({
      cancelled: true,
    });
    expect(pickStatus([{ ...deps[2]!, delay: null }], 'U8', when)).toBeNull();
    expect(pickStatus(deps, 'M10', when)).toBeNull();
  });

  it('says it in a few words', () => {
    expect(liveText('U8', { cancelled: true })).toEqual({ text: 'U8 fällt aus', bad: true });
    expect(liveText('U8', { cancelled: false, delay: 240 })).toEqual({
      text: 'U8 +4 Min.',
      bad: true,
    });
    expect(liveText('U8', { cancelled: false, delay: 20 })).toEqual({
      text: 'U8 pünktlich',
      bad: false,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("asks for the departures at the board's station number, with no other download", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(String(url));
        const departures = [
          { line: { name: 'U8' }, plannedWhen: '2026-10-12T10:20:00+02:00', delay: 120 },
        ];
        return Promise.resolve(new Response(JSON.stringify({ departures })));
      }),
    );
    const board = { station: 900100003, line: 'U8', at: 10 * 3600 + 20 * 60 };
    expect(await liveStatus(board, '20261012')).toEqual({ cancelled: false, delay: 120 });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/stops\/900100003\/departures\?/);
    // A stop without a station number asks nothing.
    expect(await liveStatus({ ...board, station: 0 }, '20261012')).toBeNull();
    expect(urls).toHaveLength(1);
  });
});
