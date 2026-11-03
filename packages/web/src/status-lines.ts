// The status line above the bottom buttons sits over the strip of map between the tip card
// and the buttons (y 661–680 at 360×740), so no line stays there for long (S011). Every line
// it shows, and how long:
//
// - walkLoading (footpaths downloading): STATUS_SHOW_MS from when it first went up, then
//   only the thin bar goes on; walkReady says when they arrive after that.
// - homeProgress, livingProgress (a where-to-live or home map, place/hour i of n):
//   STATUS_SHOW_MS from the run's first line, then only the bar.
// - locating: STATUS_SHOW_MS, then the busy locate button alone says it is still looking.
// - walkReady, locateOutside, locateFailed, locateDenied, linkOutside, linkCopied:
//   STATUS_SHOW_MS, then they fade.
// - failed: STATUS_SHOW_MS over a map; with no map on screen it stays, as nothing else says
//   why the screen is empty and there is no map to cover.
//
// While the first-open card is up the line is the card's last row instead (main.ts showHint).
// "Rückgängig" (UNDO_MS, 5 s) is its own row and goes the same way.

/** How long a status line stays before it fades. */
export const STATUS_SHOW_MS = 5000;
/** How long a status line fades out (style.css .status). */
export const STATUS_FADE_MS = 600;

/**
 * A line set again and again (a download's or a run's progress) that shows for `max` ms at
 * most from when it first went up. `start()` marks it up (once) and gives the time it has
 * left, `left()` the same without marking it, `reset()` starts over for the next run.
 */
export function cappedLine(now: () => number = () => performance.now(), max = STATUS_SHOW_MS) {
  let at = 0;
  let started = false;
  const left = () => (started ? Math.max(0, max - (now() - at)) : max);
  return {
    started: () => started,
    left,
    start() {
      if (!started) {
        started = true;
        at = now();
      }
      return left();
    },
    reset() {
      started = false;
    },
  };
}
