---
id: 041
title: Map minutes: a nearer stop reached later is not blocked by a farther one
type: build
kind: fix
priority: P1
size: S
needs: S040
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Every place gets the minutes of its best stop. Found by the route quality suite (S040): the
reference search is 10 min quicker to a place in Falkensee (weekday 10:26 from Savignyplatz,
11:39 instead of 11:49), and the map's own grid from that one stop gives 11:39 too.

## Build steps only — acceptance criteria
- [ ] Cause fixed: walkFrom (routing/src/walk.ts) spreads all stops' walks at once with one label per street node and a 2.5 km walk cap. A stop reached earlier but farther away (Goldkäferweg, 11:20) labels the streets first; a nearer stop reached later (Falkensee, Humboldtallee, 11:25) cannot pass them, and once the first walk reaches the cap the places behind get a detour
- [ ] `bench/suite.ts`: reference 1+ min quicker 0 on its runs; the CI sample's allowance (TODO(S041) in suite.ts) back to 0
- [ ] First map timings at 360×740 (also 4×) and the CI speed job no slower
- [ ] Tests cover the new behaviour

## Notes
- Start here (2026-11-06): ask Hendrik's yes, `scripts/steps.sh set 041 doing`; in packages/routing run
  `tsx bench/gridexact.ts` (baseline 0.8 %) and `tsx bench/suite.ts --n 300`; change `walkFrom` (src/walk.ts)
  and the cells' lookup (src/grid.ts); when fixed, set `ciMax: Infinity` (TODO(S041), bench/suite.ts) back to 0.
- Measured (bench/gridexact.ts, weekday-10, 8 starts × 150 cells): 0.8 % of reachable cells 1+ min
  too late, 0.5 % 5+ min, up to 21 min, at every start; never too early. Suite: 2 of 943 trips on foot,
  2 of 176 step-free, likely 3 of 191 by bike (recheck those after the fix).
- Tried (2026-11-06, not kept): a second label per node, the least walk, checked by the cells too.
  5+ min errors 0.5 → 0.3 %, but 1+ min ones 0.8 → 1.8 %: two labels are not enough (a front of
  labels can be longer, and a label demoted to second is lost when a third arrives).
- Options: (a) a full Pareto front (time, walk) per node, label-correcting in time order; exact,
  cost unknown — measure the first map (heatGrid ~0.5 s in Node for a whole map, on the hot path);
  (b) walk without the cap and apply it only at the cells: exact for the earliest label only, so not
  enough alone; (c) run the cap per source band (stops grouped by time) — approximate.
  Start with (a) on bench/gridexact.ts (target 0 %) and time it with scripts/speed/browser.mjs.
