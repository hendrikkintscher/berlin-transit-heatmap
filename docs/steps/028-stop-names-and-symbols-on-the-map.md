---
id: 028
title: Stop names and symbols on the map
type: decision
kind: research
priority: P2
size: S
needs: -
status: open
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
- Results: <table goes here once measured; recommendation in one line>

## Notes
- Speed comes first: no option that slows the first map or taps ships; the layer can be added
  after the first map if needed.
- Not the "Departures per hour" layer (optional, frequency) and not S019 Places layer (lakes, parks).
- The build becomes its own step after Hendrik's yes.
