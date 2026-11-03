import { describe, expect, it } from 'vitest';
import { LongPress, PRESS_MS, type Timers } from './long-press';

/** Timers run by hand: `tick(ms)` moves the clock on. */
function clock() {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      due.set(next, { at: now + ms, fn });
      return next++;
    },
    clear: (id) => due.delete(id),
  };
  const tick = (ms: number) => {
    now += ms;
    for (const [id, t] of [...due])
      if (t.at <= now) {
        due.delete(id);
        t.fn();
      }
  };
  return { timers, tick, pending: () => due.size };
}

function setup() {
  const c = clock();
  const pressed: [number, number][] = [];
  const lp = new LongPress((x, y) => pressed.push([x, y]), c.timers);
  return { ...c, lp, pressed };
}

const touch = (id: number, x: number, y: number) => ({ id, x, y, kind: 'touch' });

describe('long press', () => {
  it('a finger held still for half a second presses there, and its click is swallowed', () => {
    const { lp, tick, pressed } = setup();
    lp.pointerDown(touch(1, 100, 200));
    tick(PRESS_MS - 1);
    expect(pressed).toEqual([]);
    lp.pointerMove({ id: 1, x: 104, y: 203 });
    tick(1);
    expect(pressed).toEqual([[100, 200]]);
    lp.pointerUp(1);
    expect(lp.swallow()).toBe(true);
    expect(lp.swallow()).toBe(false);
  });

  it('a short tap stays a tap: no press, its click goes through', () => {
    const { lp, tick, pressed, pending } = setup();
    lp.pointerDown(touch(1, 100, 200));
    tick(120);
    lp.pointerUp(1);
    expect(pending()).toBe(0);
    tick(PRESS_MS);
    expect(pressed).toEqual([]);
    expect(lp.swallow()).toBe(false);
  });

  it('panning ends the wait', () => {
    const { lp, tick, pressed } = setup();
    lp.pointerDown(touch(1, 100, 200));
    lp.pointerMove({ id: 1, x: 100, y: 215 });
    tick(PRESS_MS * 2);
    expect(pressed).toEqual([]);
  });

  it('a second finger (pinch zoom) ends the wait', () => {
    const { lp, tick, pressed } = setup();
    lp.pointerDown(touch(1, 100, 200));
    tick(200);
    lp.pointerDown(touch(2, 180, 260));
    tick(PRESS_MS * 2);
    lp.pointerUp(2);
    tick(PRESS_MS * 2);
    expect(pressed).toEqual([]);
  });

  it('a click left over from a press does not swallow the next tap', () => {
    const { lp, tick } = setup();
    lp.pointerDown(touch(1, 100, 200));
    tick(PRESS_MS);
    lp.pointerUp(1);
    // No click came (iOS sends none after a long press); the next tap is a tap.
    lp.pointerDown(touch(2, 50, 50));
    lp.pointerUp(2);
    expect(lp.swallow()).toBe(false);
  });

  it('a right-click presses at once; a held left click stays a click', () => {
    const { lp, tick, pressed } = setup();
    lp.pointerDown({ id: 1, x: 10, y: 20, kind: 'mouse' });
    tick(PRESS_MS * 2);
    lp.pointerUp(1);
    expect(pressed).toEqual([]);
    lp.pointerDown({ id: 1, x: 30, y: 40, kind: 'mouse' }, 2);
    lp.contextMenu(30, 40);
    expect(pressed).toEqual([[30, 40]]);
    // No click follows a right-click, so nothing is swallowed.
    expect(lp.swallow()).toBe(false);
  });

  it("the browser's menu after a touch does not press a second time", () => {
    const { lp, tick, pressed } = setup();
    lp.pointerDown(touch(1, 100, 200));
    tick(PRESS_MS);
    lp.contextMenu(100, 200);
    expect(pressed).toEqual([[100, 200]]);
  });
});
