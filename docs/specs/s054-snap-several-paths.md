# S054: Snapping a place to several nearby paths

Task S054 in `feature_list.json`, from S042 (decision 0016). Measured and built on 2026-11-10,
not shipped (Hendrik, 2026-11-10, decision 0017): every version that keeps the map and the card in
agreement slows the maps.

## Problem

A place enters the footpaths at its nearest edge only. Where that edge is a path that reaches the
street only far round (a courtyard, a fenced footway, a path along the tracks), the walk to a stop is
far longer than it needs to be. `packages/routing/bench/snapwalks.ts`: 1,000 random trips on
`timetable-weekday-10`, seed 40, places within 400 m of a stop and 2–25 km apart (as
`bench/suite.ts --ci` draws them), the walk to the first stop ridden and from the last.

## Results

Walks over 2.5× the straight line, 100+ m longer ("not at a rail station": the stop is no S-, U-Bahn
or regional station, whose stop sits on the platform and is reached by its entrances):

| Version                                                              | Start walks over 2.5× | Not at a rail station | End walks over 2.5× | Not at a rail station | Maps (Node, 4 origins) | Snapping cells |
| -------------------------------------------------------------------- | --------------------- | --------------------- | ------------------- | --------------------- | ---------------------- | -------------- |
| main                                                                 | 72 of 990             | 24                    | 91 of 995           | 30                    | 1256 ms                | 303 ms         |
| A place snaps to up to 4 edges within 30 m more; cells keep one      | 38                    | 8                     | 52                  | 14                    | +3 %                   | +1 %           |
| Places and cells snap to 2 edges (unless the two meet within a step) | 58                    | 15                    | 69                  | 14                    | +11–14 %               | +46 %          |

- Spread 15/50/80 m and 4 or 8 edges (place only): 50/32/31 and 48/25/21 start walks over 2.5×; more
  spread means walking through more buildings.
- Only the place, not the cells: the card's walk to a tapped place then differs from the map's minutes
  for its cell (the route suite's reference check flags 2 of 40 trips), and with only the map's own
  place snapped to several paths, moving the map to the trip's other end changes the trip for places
  whose nearest stop gets 1+ min nearer: 152 of 2,000 random places (7.6 %).
- Cells with a second edge: 191,846 of 1,628,259 (12 %) with the "meet within a step" filter; without
  it nearly every city cell (two pavements). Storing only the edge number costs 4 bytes a cell; the
  time is in reading two more labels per such cell and in tracking the second edge while snapping.
- Picking one better edge instead (skip dead ends): of the outliers, few sit on a dead end (bridge
  search over the network, 95 ms); most nearest paths lie on long loops.
- Most walks still over 2.5× end at rail stations (the stop's point on the platform, the way in by an
  entrance) or are real detours (railways, rivers, big roads).

The code of both versions (`snapNear`, `edgesMeet`, `CellSnaps.edge2`, tests) is in commits
`b2692ed` (place only) and `df0ad61` (cells too), kept in the S054 PR's history.
