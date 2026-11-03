/**
 * A long press on the map (S009): a finger held still for about half a second. It only
 * listens: a short tap goes on as a click at once, with nothing waiting for the press.
 * A second finger (pinch), a move beyond a few pixels (pan) or lifting the finger ends the wait.
 * The click a long press may leave behind when the finger lifts is swallowed (`swallow`).
 * A mouse uses the right button instead (`contextmenu`), so a held left click stays a click.
 */
export const PRESS_MS = 500;
/** How far (CSS px) the finger may drift and still count as held still. */
export const PRESS_SLOP = 10;

export interface PressPoint {
  id: number;
  x: number;
  y: number;
  /** The pointer's kind: 'touch', 'pen' or 'mouse'. */
  kind: string;
}

export interface Timers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const windowTimers: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

export class LongPress {
  private readonly down = new Map<number, { x: number; y: number }>();
  private timer = 0;
  private lastKind = '';
  private fired = false;

  constructor(
    private readonly onPress: (x: number, y: number) => void,
    private readonly timers: Timers = windowTimers,
  ) {}

  /** `button` above 0 (a mouse's right or middle button) only notes the pointer's kind. */
  pointerDown(p: PressPoint, button = 0) {
    this.lastKind = p.kind;
    if (button > 0) return;
    // A new touch: the click after an earlier press is no longer coming.
    if (!this.down.size) this.fired = false;
    this.down.set(p.id, { x: p.x, y: p.y });
    this.stop();
    if (p.kind === 'mouse' || this.down.size > 1) return;
    this.timer = this.timers.set(() => {
      this.timer = 0;
      this.fired = true;
      this.onPress(p.x, p.y);
    }, PRESS_MS);
  }

  pointerMove(p: Pick<PressPoint, 'id' | 'x' | 'y'>) {
    const at = this.down.get(p.id);
    if (at && Math.hypot(p.x - at.x, p.y - at.y) > PRESS_SLOP) this.stop();
  }

  pointerUp(id: number) {
    this.down.delete(id);
    this.stop();
  }

  /**
   * The browser's own menu: after a right-click it is the press; after a touch (Android opens
   * it on a long press too) the timer has it already. No click follows a right-click.
   */
  contextMenu(x: number, y: number) {
    if (this.lastKind === 'mouse' || this.lastKind === '') this.onPress(x, y);
  }

  /** A finger or button went down anywhere on the map (a marker too): an old press's click is not coming. */
  touched() {
    if (!this.down.size) this.fired = false;
  }

  /** True once for the click that follows a long press; the map's click handler skips it. */
  swallow(): boolean {
    const was = this.fired;
    this.fired = false;
    return was;
  }

  private stop() {
    if (this.timer) this.timers.clear(this.timer);
    this.timer = 0;
  }
}

/**
 * Listens on the map's canvas only, so markers and cards keep their own presses; `root` (the
 * map's box, markers included) only tells it a new touch began.
 */
export function listenLongPress(el: HTMLElement, root: HTMLElement, press: LongPress) {
  root.addEventListener('pointerdown', () => press.touched(), true);
  const at = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  el.addEventListener('pointerdown', (e) =>
    press.pointerDown({ id: e.pointerId, kind: e.pointerType, ...at(e) }, e.button),
  );
  el.addEventListener('pointermove', (e) => press.pointerMove({ id: e.pointerId, ...at(e) }));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const)
    el.addEventListener(type, (e) => press.pointerUp(e.pointerId));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = at(e);
    press.contextMenu(p.x, p.y);
  });
}
