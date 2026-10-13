import { describe, expect, it } from 'vitest';
import { computeRequest, linkState, readFrom, sameRequest } from './state';

describe('the first map, as the worker makes it ahead', () => {
  const search = '?from=52.52190,13.41320&t=weekday-10';
  const at = new Date('2026-10-13T08:30:00Z');

  it('comes from the link and the settings the start page hands on', () => {
    const { state } = linkState(search, readFrom({ 'walk-kmh': '4', travel: '1' }));
    expect(state.origin).toEqual({ lat: 52.5219, lon: 13.4132 });
    expect(state.walkKmh).toBe(4);
    expect(state.travel).toBe('bike');
    expect(computeRequest({ ...state, origin: state.origin! }, at)).toMatchObject({
      window: 'weekday-10',
      measure: 'next',
      walkKmh: 4,
      travel: 'bike',
      lat: 52.5219,
      lon: 13.4132,
      noImage: true,
    });
  });

  it('is the map the app asks for, leaving up to a minute later', () => {
    const { state } = linkState(search, readFrom({}));
    const s = { ...state, origin: state.origin! };
    const made = { ...computeRequest(s, at), leaveOffset: 600 };
    const asked = { type: 'compute', id: 1, ...computeRequest(s, at), leaveOffset: 630 };
    expect(sameRequest(made, asked)).toBe(true);
    expect(sameRequest(made, { ...asked, leaveOffset: 700 })).toBe(false);
    expect(sameRequest(made, { ...asked, leaveOffset: 590 })).toBe(false);
    expect(sameRequest(made, { ...asked, walkKmh: 6 })).toBe(false);
    expect(sameRequest(made, { ...asked, noImage: undefined })).toBe(false);
  });

  it('drops starts outside the area', () => {
    expect(linkState('?from=48.1,11.5', readFrom({})).state.origin).toBeNull();
  });
});
