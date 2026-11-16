# S044: Speed: walk on a street graph without shape nodes

Task S044 in `feature_list.json`. Moved from `docs/steps/044-speed-walk-on-a-street-graph-without-sha.md` on 2026-11-09. The measurements it cites are in S041's step file: `git show 012f587:docs/steps/archive/041-map-minutes-a-nearer-stop-reached-later-.md`.

## Goal

24 % of the street nodes in `walk.bin` have degree 2 (shape points on a street); they carry 22 % of
the walk labels but no decision. Walking on the junction graph makes every walk about 20 % faster:
the map's front (S041), main's single-label walk, and RAPTOR's access walk on tap.

## Acceptance criteria

- [x] Each edge gets its chain: the junction at each end (degree ≠ 2), its position along the chain
  and the chain's length; the walk graph holds the junctions only (a pure loop of degree-2 nodes keeps
  one node as its junction). As built (1.1.13): not at load but after the first map with the footpaths
  (`chainWalkNetworkInSteps`, in the worker's slices, ~120 ms), so loading takes as long as before;
  then one throwaway trip on tap (`warmTap`), since swapping the arrays deoptimises the walk code
- [x] Snapped points (stops, origin, cells: `WalkSources.add`, `timeAt`, `cellEnds`) enter and leave
  the network at the chain's junctions with the walk along the chain; points on the same chain walk
  straight along it (`sameChainMetres`, `sameChainCellMetres`, heatGrid's `chainStop`; round a loop
  the other way goes through its junction, which the walk covers)
- [x] `walkPath` (drawing one trip) keeps the full graph
- [x] Results unchanged: `bench/gridexact.ts` 0 %, `bench/suite.ts --ci` exits 0, heatGrid's cells
  and travelTimes' stop times equal the old ones on the 8 gridexact starts (compare every cell and stop;
  `bench/chains.ts`). On foot all equal; by bike 7–238 cells per start earlier, none later (CHANGELOG 1.1.13)
- [x] Timings before/after at 360×740 (also 4×): first map, tap to trip, footpath map; and
  `scripts/speed/check.mjs` (loading the footpaths may not get slower than its tolerance). Numbers in
  CHANGELOG 1.1.13 and PR #415
- [x] The tests in `test/walk.test.ts` that read labels at shape nodes are rewritten for junctions

## Notes

- Measured 2026-11-06 (S041 step file): degrees 1: 29 k, 2: 131 k, 3: 255 k, 4: 129 k of 546 k nodes;
  660 k chains, median 1 hop, p90 2, max 25 — the network is already simplified, so the gain is ~20 %.
