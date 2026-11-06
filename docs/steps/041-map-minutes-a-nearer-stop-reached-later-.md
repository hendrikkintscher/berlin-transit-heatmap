---
id: 041
title: Map minutes: a nearer stop reached later is not blocked by a farther one
type: build
kind: fix
priority: P1
size: S
needs: S040
status: waiting
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Every place gets the minutes of its best stop. Found by the route quality suite (S040): the
reference search is 10 min quicker to a place in Falkensee (weekday 10:26 from Savignyplatz,
11:39 instead of 11:49), and the map's own grid from that one stop gives 11:39 too.

## Build steps only — acceptance criteria
- [x] Cause fixed: walkFrom (routing/src/walk.ts) spreads all stops' walks at once with one label per street node and a 2.5 km walk cap. A stop reached earlier but farther away (Goldkäferweg, 11:20) labels the streets first; a nearer stop reached later (Falkensee, Humboldtallee, 11:25) cannot pass them, and once the first walk reaches the cap the places behind get a detour
- [x] `bench/suite.ts`: reference 1+ min quicker 0 on its runs; the CI sample's allowance (TODO(S041) in suite.ts) back to 0
- [ ] First map timings at 360×740 (also 4×) and the CI speed job no slower — NOT met: first map and tap as before, but the map redone with the footpaths and the CI job's Node maps are slower (Results)
- [x] Tests cover the new behaviour

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

## Results (2026-11-06, PR on branch step/S041-pareto-walk, not merged: waiting for Hendrik)
Built option (a): `walkFront` (routing/src/walk.ts) keeps per street node every (time, walk) label
no other beats on both, settled in time order; heatGrid (src/grid.ts) takes per cell the earliest
label whose walk + the way to the cell fits maxM (fallbackM where none does). Exact: `bench/gridexact.ts`
1.3 % → 0.0 % of cells 1+ min too late (1,200 cells, today's weekday-10). Suite `--n 300` (depart,
step-free, bike; from 20261107): reference quicker 0 / 0 / 0; CI sample exits 0 with the allowance at 0.
Found on the way: by bike, riding all the way (maxOriginSeconds) lost to a later stop within
maxFinalWalk (3 of 95 trips); on main it won only through the blocking. The origin's own walk now
counts as within maxM over its whole reach (test added).

Cost — the front holds about 3 labels per node (1.6 M for 546 k nodes from Alexanderplatz); each one
walks on, so the walk is ~5× main's (245 vs 45 ms), heatGrid ~350 vs ~105 ms in Node.
| Measure (median) | main | branch |
| --- | --: | --: |
| First map, 360×740 (drawn before the footpaths are in) | 678 ms | 638 ms |
| … 4× CPU | 1160 ms | 1275 ms (bimodal, noise) |
| Tap to trip (before the footpaths) | 156 ms | 193 ms (noise) |
| … 4× CPU | 204 ms | 202 ms |
| Map redone with the footpaths (walk → result) | 990 ms | 1255 ms |
| … 4× CPU (worker not slowed) | 1530 ms | 1956 ms |
| Tap with the footpaths in, Node (appJourney) | 11 ms | 21 ms |
| CI speed job, 4 maps in Node | 575 ms | 1414 ms (fails: +146 %) |
| worker.js gzipped | 35.7 KB | 36.8 KB (over its 34.9 KB budget +5 %) |
Tried and dropped: capping the front at K labels (no faster, 0.1–1.4 % errors); without the
"last pushed" check (slower); labels laid out per node after the walk (slower than the
earliest label in node arrays + a side list for the rest, which is what is built).
Windowed grids (taps) now walk only from stops within the cap of the window (exact).

Options for Hendrik: (1) accept the slower footpath map (+0.27 s, +0.43 s at 4×) and CI maps:
raise the speed job's tolerance/budget in the PR, bump, merge; (2) keep main's walk for the
whole map and the exact one only for taps (map minutes stay up to 21 min late in ~1 % of cells,
the trip on tap is exact) — needs a new small step; (3) look for a faster exact method first
(e.g. the front only where the earliest walk nears the cap) — a research step, size M.
