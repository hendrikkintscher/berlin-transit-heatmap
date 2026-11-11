# S043: Speed: the walk front only where the cap can bite

Task S043 in `feature_list.json`. Moved from `docs/steps/043-speed-the-walk-front-only-where-the-cap-.md` on 2026-11-09. The measurements it cites are in S041's step file: `git show 012f587:docs/steps/archive/041-map-minutes-a-nearer-stop-reached-later-.md`.

## Goal

The map's exact walk (S041, `walkFront`) keeps about 3 (time, walk) labels per street node and takes
about 5× main's single-label walk on foot (250 vs 44 ms; by bike 633 ms, a 3.6 M-label front), though
only 29 % of the labels are ever used by a cell. Win back what can be won exactly: heatGrid in Node
about 350 → 240 ms on foot, 747 → 420 ms by bike (estimates from the measurements in S041's step file).

## Acceptance criteria

- [ ] Two passes: an uncapped single-label walk (exact earliest time per node, 44 ms) marks the
  "fringe": nodes whose earliest label's walk, plus the way to one of their cells, exceeds the cap, or
  that are not reached. Everywhere else the earliest label is the exact answer
- [x] A bound per node: the exact network distance to the nearest fringe node's cell, from a walk
  over the network out of the fringe cells (about 20–35 ms; 2026-11-11). Not a Euclidean grid as first
  planned: edge lengths are whole metres and node positions quantised (the straight line is up to 1.6 m
  longer than an edge), so a straight-line bound is not sound. All cells of a fringe node count, not
  only those its earliest label cannot serve (they read the same labels)
- [ ] The second pass propagates only labels that are not their node's earliest (seeded from the
  labels the first pass dropped and from the earliest labels' arcs), and drops a label as soon as its
  walk plus that bound exceeds the cap — exact, since no descendant can then fit the cap at any
  fringe node. Dominance against the first pass's labels and the pass's own newest label as in walkFront
- [ ] `bench/gridexact.ts` 0 %, `bench/suite.ts --ci` exits 0, the cell results equal walkFront's on
  the 8 gridexact starts on foot and by bike (compare every cell)
- [ ] Timings before/after at 360×740 (also 4×) for the map redone with the footpaths
  (`scripts/speed/browser.mjs` "footpath map") and `scripts/speed/check.mjs`; the one-time map
  allowance in `scripts/speed/budget.json` (`mapAllowanceOnce`) is removed when the maps fit the
  tolerance again, else lowered to what was won

## Status (2026-11-11, paused, continued locally)

Built on branch `ccr-abfac0b5-jjjw6t` (`walkFrontForCells` in `walk.ts`, no PR yet): on foot every
cell's minutes and stop equal main's on the 8 gridexact starts, heatGrid 3164 → 2085 ms for all 8
(`bench/frontexact.ts`). The second pass is walkFront with the bound, not yet "only labels that are not
their node's earliest". By bike it gains nothing (the long caps and the ride all the way leave nothing
to prune), so heatGrid keeps plain walkFront there; measured +2.5 %, main against itself ±2 %: recheck.
Open: tests for walkFrontForCells, gridexact.ts, suite.ts --ci, browser.mjs and check.mjs timings,
CHANGELOG and bump, PR.

## Notes

- Measured 2026-11-06 (S041 step file, "Speed research"): fringe = 11 % of nodes with cells on foot,
  8 % by bike; the bound keeps 43 % / 54 % of the extra labels; a network Dijkstra for the bound costs
  52 ms, hence the grid transform. The bound must be sound: a prototype with "distance to the nearest
  cap death" was not (1,826 cells differed) because a blocked label's descendants may matter far from
  where its blocker died; "distance to the nearest fringe node" after an uncapped pass is.
- Tried and not worth it (same place): walk order instead of time order, packed records, Morton
  node order, a stronger pending check, capped fronts.
