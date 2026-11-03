import { describe, expect, it } from 'vitest';
import { cappedLine, STATUS_SHOW_MS } from './status-lines';

describe('a capped status line', () => {
  it('shows for STATUS_SHOW_MS from when it first went up, however often it is set', () => {
    let now = 1000;
    const line = cappedLine(() => now);
    expect(line.started()).toBe(false);
    expect(line.left()).toBe(STATUS_SHOW_MS);
    expect(line.start()).toBe(STATUS_SHOW_MS);
    now += 2000;
    expect(line.start()).toBe(STATUS_SHOW_MS - 2000);
    now += 2999;
    expect(line.left()).toBe(1);
    now += 1;
    expect(line.start()).toBe(0);
    now += 60_000;
    expect(line.left()).toBe(0);
    expect(line.started()).toBe(true);
  });

  it('starts over after a reset', () => {
    let now = 0;
    const line = cappedLine(() => now, 100);
    line.start();
    now = 500;
    expect(line.left()).toBe(0);
    line.reset();
    expect(line.started()).toBe(false);
    expect(line.start()).toBe(100);
  });
});
