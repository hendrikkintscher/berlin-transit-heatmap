import { describe, expect, it } from 'vitest';
import { decodeLines, encodeLines, hopCourse } from '../src/linesbin';

const pos = (s: number): [number, number] => [13.4 + s * 0.01, 52.5];

describe('lines.bin', () => {
  it('round-trips hop courses and runs them either way', () => {
    const bytes = encodeLines(
      [
        { a: 2, b: 5, inner: [[13.43, 52.51]] },
        {
          a: 0,
          b: 1,
          inner: [
            [13.402, 52.501],
            [13.405, 52.502],
          ],
        },
      ],
      pos,
    );
    const lines = decodeLines(bytes.buffer, 10, pos);
    expect(hopCourse(lines, 0, 1, pos)).toEqual([
      pos(0),
      [13.402, 52.501],
      [13.405, 52.502],
      pos(1),
    ]);
    expect(hopCourse(lines, 5, 2, pos)).toEqual([pos(5), [13.43, 52.51], pos(2)]);
    // Not in the file: straight.
    expect(hopCourse(lines, 3, 4, pos)).toEqual([pos(3), pos(4)]);
    expect(hopCourse(null, 0, 1, pos)).toEqual([pos(0), pos(1)]);
  });
});
