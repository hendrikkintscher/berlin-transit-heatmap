---
id: 044
title: Speed: walk on a street graph without shape nodes
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
24 % of the street nodes in `walk.bin` have degree 2 (shape points on a street); they carry 22 % of
the walk labels but no decision. Walking on the junction graph makes every walk about 20 % faster:
the map's front (S041), main's single-label walk, and RAPTOR's access walk on tap.

## Build steps only — acceptance criteria
- [ ] At load (`loadWalkNetworkInSteps`) each edge gets its chain: the junction at each end
  (degree ≠ 2), its position along the chain and the chain's length; the walk graph holds the
  junctions only (a pure loop of degree-2 nodes keeps one node as its junction)
- [ ] Snapped points (stops, origin, cells: `WalkSources.add`, `timeAt`, `cellEnds`) enter and leave
  the network at the chain's junctions with the walk along the chain; points on the same chain walk
  straight along it (`sameEdgeMetres`, `sameEdgeCellMetres` and heatGrid's `edgeStop` become per
  chain; a loop takes the shorter way round)
- [ ] `walkPath` (drawing one trip) keeps the full graph
- [ ] Results unchanged: `bench/gridexact.ts` 0 %, `bench/suite.ts --ci` exits 0, heatGrid's cells
  and travelTimes' stop times equal the old ones on the 8 gridexact starts (compare every cell and stop)
- [ ] Timings before/after at 360×740 (also 4×): first map, tap to trip, footpath map; and
  `scripts/speed/check.mjs` (loading the footpaths may not get slower than its tolerance: the chains
  are built in about 20 ms)
- [ ] The tests in `test/walk.test.ts` that read labels at shape nodes are rewritten for junctions

## Notes
- Measured 2026-11-06 (S041 step file): degrees 1: 29 k, 2: 131 k, 3: 255 k, 4: 129 k of 546 k nodes;
  660 k chains, median 1 hop, p90 2, max 25 — the network is already simplified, so the gain is ~20 %.
