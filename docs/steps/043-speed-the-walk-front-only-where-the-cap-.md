---
id: 043
title: Speed: the walk front only where the cap can bite
type: build
kind: refactor
priority: P2
size: M
needs: S041
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The map's exact walk (S041, `walkFront`) keeps about 3 (time, walk) labels per street node and takes
about 5× main's single-label walk on foot (250 vs 44 ms; by bike 633 ms, a 3.6 M-label front), though
only 29 % of the labels are ever used by a cell. Win back what can be won exactly: heatGrid in Node
about 350 → 240 ms on foot, 747 → 420 ms by bike (estimates from the measurements in S041's step file).

## Build steps only — acceptance criteria
- [ ] Two passes: an uncapped single-label walk (exact earliest time per node, 44 ms) marks the
  "fringe": nodes whose earliest label's walk, plus the way to one of their cells, exceeds the cap, or
  that are not reached. Everywhere else the earliest label is the exact answer
- [ ] A Euclidean distance transform on a coarse grid over the network (about 200 m; Felzenszwalb, a
  few ms) gives each node a lower bound of its network distance to the nearest fringe node (take the
  cell's own far walk into it: min over fringe cells of sqrt(d² + dc²))
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

## Notes
- Measured 2026-11-06 (S041 step file, "Speed research"): fringe = 11 % of nodes with cells on foot,
  8 % by bike; the bound keeps 43 % / 54 % of the extra labels; a network Dijkstra for the bound costs
  52 ms, hence the grid transform. The bound must be sound: a prototype with "distance to the nearest
  cap death" was not (1,826 cells differed) because a blocked label's descendants may matter far from
  where its blocker died; "distance to the nearest fringe node" after an uncapped pass is.
- Tried and not worth it (same place): walk order instead of time order, packed records, Morton
  node order, a stronger pending check, capped fronts.
