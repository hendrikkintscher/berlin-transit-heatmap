import { describe, expect, it } from 'vitest';
import {
  chosenStart,
  computeRequest,
  linkState,
  mapDirection,
  mapToGoal,
  readFrom,
  sameRequest,
} from './state';

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
    });
  });

  it('has the colour fill on for a first visit, and keeps it off once switched off', () => {
    const first = linkState(search, readFrom({})).state;
    expect(first.heat).toBe(true);
    const req = computeRequest({ ...first, origin: first.origin! }, at);
    expect(req.noImage).toBeUndefined();
    // The first map comes without its colours, which the worker paints right after it.
    expect(computeRequest({ ...first, origin: first.origin! }, at, true)).toMatchObject({
      noImage: true,
      paintNext: true,
    });
    const off = linkState(search, readFrom({ heat: '0' })).state;
    expect(off.heat).toBe(false);
    const offReq = computeRequest({ ...off, origin: off.origin! }, at, true);
    expect(offReq).toMatchObject({ noImage: true });
    expect(offReq.paintNext).toBeUndefined();
  });

  it('is the map the app asks for, leaving up to a minute later', () => {
    const { state } = linkState(search, readFrom({}));
    const s = { ...state, origin: state.origin! };
    const made = { ...computeRequest(s, at, true), leaveOffset: 600 };
    const asked = { type: 'compute', id: 1, ...computeRequest(s, at, true), leaveOffset: 630 };
    expect(sameRequest(made, asked)).toBe(true);
    expect(sameRequest(made, { ...asked, leaveOffset: 700 })).toBe(false);
    expect(sameRequest(made, { ...asked, leaveOffset: 590 })).toBe(false);
    expect(sameRequest(made, { ...asked, walkKmh: 6 })).toBe(false);
    expect(sameRequest(made, { ...asked, noImage: undefined })).toBe(false);
    expect(sameRequest(made, { ...asked, paintNext: undefined })).toBe(false);
  });

  it('drops starts outside the area, for the example map', () => {
    const { state, outside } = linkState('?from=48.1,11.5', readFrom({}));
    expect(outside).toBe(true);
    expect(state.example).toBe(true);
    expect(chosenStart(state)).toBeNull();
  });
});

describe('the example map on a visit without a start (S014)', () => {
  it('opens on the example start of the region, which is not a start chosen by anyone', () => {
    for (const search of ['', '?t=weekday-10&lang=en', '?h=8&layers=freq']) {
      const { state } = linkState(search, readFrom({}));
      expect(state.example).toBe(true);
      expect(state.origin).toEqual({ lat: 52.5219, lon: 13.4132 });
      expect(chosenStart(state)).toBeNull();
    }
  });

  it('is not used when the link has a start', () => {
    const { state } = linkState('?from=52.5,13.4', readFrom({}));
    expect(state.example).toBe(false);
    expect(chosenStart(state)).toEqual({ lat: 52.5, lon: 13.4 });
  });

  it('keeps a destination in the link only with a start of its own', () => {
    const { state, link } = linkState('?to=52.5,13.4', readFrom({}));
    expect(state.example).toBe(true);
    expect(link.to).toBeNull();
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
