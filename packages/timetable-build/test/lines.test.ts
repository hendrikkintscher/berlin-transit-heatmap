import { describe, expect, it } from 'vitest';
import { hopCourses, placeStops, simplify } from '../src/lines.ts';

// An L-shaped track: east along 52.5, then north along 13.42.
const track = new Float64Array([
  13.4, 52.5, 13.405, 52.5, 13.41, 52.5, 13.415, 52.5, 13.42, 52.5, 13.42, 52.505, 13.42, 52.51,
]);
const stopPos: [number, number][] = [
  [13.4, 52.5],
  [13.41, 52.5],
  [13.42, 52.51],
];

describe('line courses', () => {
  it('drops points on a straight stretch', () => {
    expect(
      simplify(
        [
          [13.4, 52.5],
          [13.41, 52.5],
          [13.42, 52.5],
          [13.42, 52.51],
        ],
        4,
      ),
    ).toEqual([
      [13.4, 52.5],
      [13.42, 52.5],
      [13.42, 52.51],
    ]);
  });

  it('places stops on the shape in order and gives up far from it', () => {
    const placed = placeStops(track, stopPos)!;
    expect(placed.map((p) => p.seg)).toEqual([0, 1, 5]);
    expect(placeStops(track, [[13.5, 52.6]])).toBeNull();
  });

  it('gives a hop the shape between its stops, leaving straight hops out', () => {
    const hops = hopCourses(
      [{ shape: 's', stops: [0, 1, 2] }],
      new Map([['s', track]]),
      (s) => stopPos[s]!,
    );
    // 0 -> 1 runs straight along the track: no course needed.
    expect(hops).toEqual([{ a: 1, b: 2, inner: [[13.42, 52.5]] }]);
  });
});
