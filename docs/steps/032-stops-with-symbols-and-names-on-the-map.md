---
id: 032
title: Stops with symbols and names on the map
type: build
kind: feature
priority: P2
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Stops are on the map with a symbol, and their names where there is room (S028 / decision 0009,
option C): S-, U-Bahn and regional stations with names from the city view, tram, bus and ferry
stops as dots from street zoom with names a step closer. Taken from the timetable the worker
already has, after the first map, so nothing loads or waits for it.

## Build steps only — acceptance criteria
- [ ] The worker builds one point per station (platforms merged as in `layers.ts`) with its strongest mode, once the first map is shown; the page draws them under the trip and over the colours and time rings
- [ ] S/U/RE dots and names from the city view (S/U with a bold letter from about zoom 13); tram/bus/ferry dots from about zoom 13, names from about zoom 14; S/U names win where labels collide
- [ ] Names are the app's own stop names (same as the trip card), in the map's regular font
- [ ] First map, tap to trip, ⇅ and the rings no slower at 360×740, also at 4× CPU (medians of 6–8 visits); bundle budget kept
- [ ] Tests cover the station list (merging, mode, names)

## Notes
- Prototype, script and timings: project files `measure-S028/` (`prototype.patch`, `stops.mjs`, `timings.txt`, `compare.png`).
- The prototype sends ~5,200 stations as GeoJSON (~820 KB JSON); slimmer data (fewer fields, rounded coordinates) is worth trying.
- Not the "Departures per hour" layer, which stays as it is.
