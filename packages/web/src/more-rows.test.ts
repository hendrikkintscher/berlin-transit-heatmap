import { describe, expect, it } from 'vitest';
import { bestRows, refitRows, ridesKey } from './more-rows';
import type { FromWorker, TripLeg } from './protocol';

type Trip = Extract<FromWorker, { type: 'trip' }>;

describe('bestRows', () => {
  it('keeps a faster other line and drops the later trips it beats', () => {
    const own = [
      { id: 'bus 10:10', start: 600, end: 3000 },
      { id: 'bus 10:20', start: 1200, end: 3600 },
    ];
    const sbahn = { id: 'S 10:15', start: 900, end: 2400 };
    expect(bestRows([...own, sbahn], 10).map((r) => r.id)).toEqual(['S 10:15', 'bus 10:20']);
  });
  it('keeps the first of equal rows and caps the list', () => {
    const rows = [
      { id: 'a', start: 60, end: 100 },
      { id: 'b', start: 60, end: 100 },
      { id: 'c', start: 120, end: 200 },
      { id: 'd', start: 180, end: 300 },
    ];
    expect(bestRows(rows, 2).map((r) => r.id)).toEqual(['a', 'c']);
  });
});

const ride = (name: string, from: string, to: string, dep: number, arr: number): TripLeg => ({
  type: 'ride',
  name,
  mode: 'subway',
  from,
  to,
  stops: 3,
  dep,
  arr,
});
const walk = (minutes: number): TripLeg => ({ type: 'walk', minutes });
const line = (walk: boolean, n: number) => ({
  type: 'Feature' as const,
  properties: { mode: walk ? 'walk' : 'subway', walk },
  geometry: {
    type: 'LineString' as const,
    coordinates: Array.from({ length: n }, (_, i): [number, number] => [i, i]),
  },
});
const stop = (name: string, x: number) => ({
  type: 'Feature' as const,
  properties: { name, mode: 'subway', end: true },
  geometry: { type: 'Point' as const, coordinates: [x, 0] },
});
/** Each stop name's place. */
const PLACES: Record<string, number> = { Alex: 1, Hpl: 3, Hbf: 4, X: 5, Y: 6 };
const conn = (legs: TripLeg[], leave: number, arrive: number, walks: number[]): Trip => ({
  type: 'trip',
  id: 1,
  journeys: [{ legs, transfers: 0, leave, arrive }],
  lines: {
    type: 'FeatureCollection',
    features: [line(true, walks[0]!), line(false, 2), line(true, walks[1]!)],
  },
  stops: {
    type: 'FeatureCollection',
    features: legs.flatMap((l) =>
      l.type === 'ride' ? [stop(l.from, PLACES[l.from]!), stop(l.to, PLACES[l.to]!)] : [],
    ),
  },
});

describe('refitRows', () => {
  // Shown: walk to Alex, U8 at 1000 to Hermannplatz at 1600, walk on. Walks redone: 3 and 2 min.
  const shown = conn([walk(3), ride('U8', 'Alex', 'Hpl', 1000, 1600), walk(2)], 820, 1720, [9, 7]);
  it('takes the shown walks for a row from and to the same stops', () => {
    const later = conn(
      [walk(1), ride('U8', 'Alex', 'Hpl', 1300, 1900), walk(1)],
      1240,
      1960,
      [2, 2],
    );
    const [r] = refitRows([later], shown);
    expect(r!.journeys[0]).toMatchObject({ leave: 1120, arrive: 2020 });
    expect(r!.journeys[0]!.legs).toEqual([walk(3), ride('U8', 'Alex', 'Hpl', 1300, 1900), walk(2)]);
    expect(r!.lines.features.map((f) => f.geometry.coordinates.length)).toEqual([9, 2, 7]);
  });
  it('fits only the end with the same stop', () => {
    const other = conn([walk(5), ride('S1', 'Hbf', 'Hpl', 1100, 1500), walk(1)], 800, 1560, [2, 2]);
    const [r] = refitRows([other], shown);
    expect(r!.journeys[0]).toMatchObject({ leave: 800, arrive: 1620 });
    expect(r!.journeys[0]!.legs.map((l) => (l.type === 'walk' ? l.minutes : l.name))).toEqual([
      5,
      'S1',
      2,
    ]);
    expect(r!.lines.features.map((f) => f.geometry.coordinates.length)).toEqual([2, 2, 7]);
  });
  it('tells a platform of the same name apart', () => {
    const s = conn([walk(3), ride('S3', 'Alex', 'Hpl', 1000, 1600), walk(2)], 820, 1720, [9, 7]);
    s.stops.features[0]!.geometry.coordinates = [2, 0];
    const u = conn([walk(1), ride('U8', 'Alex', 'Y', 1100, 1500), walk(1)], 1040, 1560, [2, 2]);
    expect(refitRows([u], s)[0]).toBe(u);
  });
  it('leaves a row with other stops as it is', () => {
    const other = conn([walk(5), ride('M10', 'X', 'Y', 1100, 1500), walk(1)], 800, 1560, [2, 2]);
    expect(refitRows([other], shown)[0]).toBe(other);
  });
});

describe('ridesKey', () => {
  it('tells connections apart by their vehicles, not their walks', () => {
    const a = conn([walk(1), ride('U8', 'Alex', 'Hpl', 1000, 1600), walk(1)], 940, 1660, [2, 2]);
    const b = conn([walk(3), ride('U8', 'Alex', 'Hpl', 1000, 1600), walk(2)], 820, 1720, [9, 7]);
    const c = conn([walk(1), ride('U8', 'Alex', 'Hpl', 1300, 1900), walk(1)], 1240, 1960, [2, 2]);
    expect(ridesKey(a)).toBe(ridesKey(b));
    expect(ridesKey(a)).not.toBe(ridesKey(c));
    expect(ridesKey(conn([walk(9)], 0, 540, [2, 2]))).toBe('');
  });
});
