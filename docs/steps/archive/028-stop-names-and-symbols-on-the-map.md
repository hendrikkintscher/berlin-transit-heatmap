---
id: 028
title: Stop names and symbols on the map
type: decision
kind: research
priority: P2
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Stops are always visible on the map with a symbol, and their names show where there is room
(Hendrik, 2026-11-03: "stop names and symbols on the map in general"), without slowing the first
map or a tap.

## Decision steps only
- Question: how to draw every stop with a symbol and its name (S/U/Tram/Bus look, from which zoom,
  names only from a closer zoom, under or over the colours and time lines), and what it costs.
- Measure: two or three ways (e.g. a symbol layer from the stop list the app already loads, the
  basemap's own transit labels switched on, names only on S/U from the city view), each against
  main at 360×740, also with the page CPU slowed 4×: first map, tap to trip, ⇅, moving the rings,
  plus bundle/data bytes. Screenshots at city and street zoom for the look.
- Results (2026-11-03, 360×740, real basemap, 6 fresh visits each, medians in ms, 1× / 4× CPU):

  | | first map | tap → trip | ⇅ → trip | rings → trip |
  |---|---|---|---|---|
  | main | 881 / 1742 | 56 / 98 | 625 / 1050 | 418 / 940 |
  | A all own stops everywhere | 889 / 1395 | 58 / 87 | 659 / 985 | 442 / 639 |
  | B basemap's stops (OpenMapTiles poi) | 1095 / 1414 | 57 / 95 | 714 / 907 | 407 / 700 |
  | C S/U/RE from city view, rest closer | 1011 / 1682 | 62 / 96 | 747 / 989 | 441 / 651 |

  None slower beyond noise; stop list built in the worker in ~25 ms after the first map, no extra
  download, ~0.6 KB gzipped code. A buries the city view under 4,400 bus dots; B shows nothing
  below zoom 12, a dot per platform, OSM names. Recommended C; Hendrik chose C (decision 0009, build S032).

## Notes
- Speed comes first: no option that slows the first map or taps ships; the layer can be added
  after the first map if needed.
- Not the "Departures per hour" layer (optional, frequency) and not S019 Places layer (lakes, parks).
- The build becomes its own step after Hendrik's yes.
