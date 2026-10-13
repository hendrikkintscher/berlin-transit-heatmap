import { describe, expect, it } from 'vitest';
import { flowDashes, joinPaths, pathLook, pointAlong } from './path-looks';

const line = (coordinates: [number, number][]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates },
});

describe('trial path looks', () => {
  it('reads path=a|b|c from the link, nothing else', () => {
    expect(pathLook('?from=1,2&path=b')).toBe('b');
    expect(pathLook('?path=d')).toBeNull();
    expect(pathLook('')).toBeNull();
  });

  it('moves the dash forward one step a frame over one whole period', () => {
    const frames = flowDashes(1.5, 2.5, 0.5);
    expect(frames).toHaveLength(8);
    expect(frames[0]).toEqual([0, 0, 1.5, 2.5]);
    expect(frames[1]).toEqual([0, 0.5, 1.5, 2]);
    // Past the gap the dash wraps to the line's start.
    expect(frames[6]).toEqual([0.5, 2.5, 1, 0]);
    for (const f of frames) expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(4);
  });

  it('joins a journey’s pieces and starts a new line for another start', () => {
    const paths = joinPaths({
      type: 'FeatureCollection',
      features: [
        line([
          [13.4, 52.5],
          [13.41, 52.5],
        ]),
        line([
          [13.41, 52.5],
          [13.42, 52.51],
        ]),
        line([
          [13.3, 52.4],
          [13.31, 52.4],
        ]),
      ],
    });
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveLength(4);
  });

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
});
