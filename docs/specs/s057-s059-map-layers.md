# S057–S059: Stops, network lines and ATMs on the map, by zoom

Tasks S057–S060 in `feature_list.json` (Hendrik, 2026-11-10). All four are built (S060 in 1.1.10).

## Before these tasks

- Stops (decision 0009, S032): S-, U-Bahn and regional stations as dots from the city view, with a
  bold S or U from zoom 13; tram, bus and ferry stops as dots from zoom 13, named from zoom 14
  (`addStops` in `packages/web/src/map-layers.ts`).
- Lines: only the lines of the shown map's trips ("Linien" switch) and the trip on the card. The
  network itself was not drawn; the base map shows some rail.
- ATMs (S049): dots from zoom 12, "€" from 14, the bank's name from 15 (`packages/web/src/addons.ts`).

## Wanted

- **S057 Stop dots only from street level.** No stop dots in the city view, for every mode
  (this replaces decision 0009's S/U dots from the city view). Proposal: all dots from zoom 14,
  names as today. Hendrik (2026-11-10): in the city view only the names (no dots) of major
  stations: Alexanderplatz, Friedrichstraße, Ostbahnhof, Zoologischer Garten and the stations where
  the Ring crosses the Stadtbahn or a north–south line (Westkreuz, Ostkreuz, Gesundbrunnen,
  Südkreuz and the like). Built in 1.1.7 (decision 0018): these eight plus Hauptbahnhof, by a
  short name, in `REGION.hubs` (`packages/routing/src/regions.ts`).
- **S060 Layer switch for lines and stations.** One switch turns the network lines (S058) and the
  stops with their names (S057) off and on. Built in 1.1.10: "Netz und Haltestellen" in Ebenen, `layers=nonet`.
- **S058 Faint network lines by mode.** Thin, faint lines of the whole network in each mode's
  colour, each mode from its own zoom. Proposal: S-Bahn, U-Bahn and regional from the city view,
  tram from zoom 12, bus from zoom 14. Data: `lines.bin` already holds every hop's course along
  the tracks and roads; the hops would need their mode (from the hour's routes) and be merged into
  one line per mode. Drawn under the time rings and the trip, so they never compete with the
  map's minutes. Built in 1.1.8 (`packages/web/src/worker-network.ts`): each group goes to MapLibre
  only near its zoom; panning is about one frame slower in the test browser (software GPU, even
  for a one-feature layer), shipped on Hendrik's yes.
- **S059 ATM dots almost always.** Proposal: small dots from zoom 10 (the whole city), growing with
  zoom; "€" and the bank's name as today. Built in 1.1.9: 1.5 px at zoom 10, 2.5 at 12, 6 at 14.

## Checks for each

- Timings at 360×740, 1× and 4× (first map, tap to trip, panning frames where the test browser
  can tell). S058 adds the most to draw: measure its cost before and after, with all modes on.
- Screenshots at the city view, zoom 12 and zoom 15, light and dark.
