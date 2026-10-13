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

  it('puts a ride’s arrow halfway along it', () => {
    const p = arrowAt([
      [13.4, 52.6],
      [13.4, 52.5],
    ]);
    expect(p!.at[1]).toBeCloseTo(52.55);
    expect(p!.bearing).toBeCloseTo(180);
    expect(arrowAt([[13.4, 52.5]])).toBeNull();
  });
});
