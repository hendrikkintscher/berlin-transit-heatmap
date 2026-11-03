---
status: accepted
date: 2026-11-03
---

# 0009 — Stops on the map from the app's own timetable: S/U from the city view, the rest closer

## Context

Hendrik wants stops visible on the map with a symbol, and their names where there is room
(step S028). Three ways were prototyped and timed against main at 360×740 with the real basemap,
6 fresh visits each (project files `measure-S028/`: `stops.mjs`, `prototype.patch`,
`timings.txt`, `compare.png`). Medians in ms, 1× / 4× page CPU:

| option                                | first map   | tap → trip | ⇅ → trip   | rings → trip |
| ------------------------------------- | ----------- | ---------- | ---------- | ------------ |
| main                                  | 881 / 1742  | 56 / 98    | 625 / 1050 | 418 / 940    |
| A: all own stops at every zoom        | 889 / 1395  | 58 / 87    | 659 / 985  | 442 / 639    |
| B: the basemap's stops (OpenMapTiles) | 1095 / 1414 | 57 / 95    | 714 / 907  | 407 / 700    |
| C: S/U/RE from city view, rest closer | 1011 / 1682 | 62 / 96    | 747 / 989  | 441 / 651    |

No option is slower beyond the noise (4× first maps swing by about ±300 ms). A and C build the
stop list in the worker from the timetable it already has, about 25 ms after the first map, with
no extra download and about 0.6 KB gzipped code. Frame times while panning were alike, but the
test browser draws only 3–4 frames a second with the real basemap, so that check is weak.

## Options considered

- **A: every stop at every zoom**: complete, but the city view is buried under ~4,400 bus dots.
- **B: the basemap's own stops**: no app data, but nothing below zoom 12 (the city view), one dot
  per platform, and OpenStreetMap names that differ from the trip card's.
- **C: own stops, S/U/RE with names from the city view, tram/bus/ferry from street zoom**: clean
  at the city view, complete up close, the same names as the trip card.
- **Leave as is**: no stops on the map.

## Decision

**C**, as its own build step S032 (Hendrik, 2026-11-03).

## Consequences

- Good: stops and their names on the map, matching the trip card, at no measured cost.
- Accepted cost: the stops come a moment after the first map (about 0.2 s, 0.7 s at 4× CPU), and
  a ~25 ms worker pause then; a tap at that very moment waits for it.
