import { describe, expect, it } from 'vitest';
import { computeRequest, linkState, mapDirection, mapToGoal, readFrom, sameRequest } from './state';

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

describe('which end the map runs to, apart from the time', () => {
  const at = new Date('2026-10-13T08:30:00Z');

  it('leaving to the place keeps a departure time and asks for the trips to it', () => {
    const { state } = linkState('?from=52.52190,13.41320&t=weekday-10&dir=goal', readFrom({}));
    expect(state.direction).toBe('depart');
    expect(mapToGoal(state)).toBe(true);
    expect(mapDirection(state)).toBe('arrive');
    expect(computeRequest({ ...state, origin: state.origin! }, at)).toMatchObject({
      window: 'weekday-10',
      direction: 'depart',
      toGoal: true,
    });
  });

  it('arriving is always to the place, leaving from a start is from it', () => {
    const arr = linkState('?from=52.52190,13.41320&t=weekday-10&dir=arr', readFrom({})).state;
    expect(mapToGoal(arr)).toBe(true);
    expect(computeRequest({ ...arr, origin: arr.origin! }, at)).toMatchObject({
      window: 'weekday-09',
      direction: 'arrive',
    });
    expect(computeRequest({ ...arr, origin: arr.origin! }, at)).not.toHaveProperty('toGoal');
    const from = linkState('?from=52.52190,13.41320&t=weekday-10', readFrom({})).state;
    expect(mapToGoal(from)).toBe(false);
    expect(mapDirection(from)).toBe('depart');
    expect(computeRequest({ ...from, origin: from.origin! }, at)).not.toHaveProperty('toGoal');
  });
});
