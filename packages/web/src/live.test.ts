import { describe, expect, it } from 'vitest';
import { berlinTime, liveText, pickStatus } from './live';

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
});
