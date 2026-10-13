import { describe, expect, it } from 'vitest';
import { arrowAt, pointAlong } from './trip-arrows';

describe('trip arrows', () => {
  it('finds a point along a line with its bearing', () => {
    const p = pointAlong(
      [
        [13.4, 52.5],
        [13.4, 52.52],
      ],
      0.5,
    );
    expect(p!.at[1]).toBeCloseTo(52.51);
    expect(p!.bearing).toBeCloseTo(0);
    const east = pointAlong(
      [
        [13.4, 52.5],
        [13.42, 52.5],
      ],
      0.85,
    );
    expect(east!.bearing).toBeCloseTo(90);
  });

  it('puts the arrow near the end of each piece, at most 400 m before it', () => {
    // About 220 m north: 15 % before the end.
    const short = arrowAt([
      [13.4, 52.5],
      [13.4, 52.502],
    ]);
    expect(short!.at[1]).toBeCloseTo(52.5017, 4);
    // About 11 km south: 400 m before the end.
    const long = arrowAt([
      [13.4, 52.6],
      [13.4, 52.5],
    ]);
    expect(long!.bearing).toBeCloseTo(180);
    expect((long!.at[1] - 52.5) * 111_320).toBeCloseTo(400, -1);
    expect(arrowAt([[13.4, 52.5]])).toBeNull();
  });
});
