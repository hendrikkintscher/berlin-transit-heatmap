# S050: Commerzbank ATMs, Commerzbank's own pages against OpenStreetMap

Task S050 in `feature_list.json` (research). Follows S048 (`docs/specs/s048-cash-group-atms.md`)
and the live layer S049.

## Source (2026-11-10)

- `commerzbank.de/filialen/de/filial-uebersicht.html` lists all 502 Commerzbank locations by name,
  28 of them in Berlin (24 branches, 4 self-service points "SB-Standort"). robots.txt allows these
  pages.
- Each location has a public page `commerzbank.de/filialen/de/<name>` with a JSON record in the
  HTML: the exact position, the address, the branch's opening hours (per weekday and as a calendar
  for the coming weeks), wheelchair access (`barriereTyp` FREI / TEILFREI / NICHTFREI), and
  equipment flags: `geldautomat`, `einzahlautomat` (cash-deposit machine), `costFreeATM`,
  `kontoauszugsdrucker`, `sbTerminal`, `kasse` (staffed cash desk).
- Read: the 28 Berlin pages, once, 2 s apart, as plain page views. The record also holds internal
  contacts (e-mail, organisation numbers); those were not kept.

## Results

| measure                                     | Commerzbank pages                                                                                                          | OpenStreetMap (app file, 7 Nov)                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Commerzbank locations / ATMs in Berlin      | 28 locations, all `costFreeATM`                                                                                            | 33 ATMs in the app's area                                                                         |
| matched within 50 m                         | 22 of 28                                                                                                                   | –                                                                                                 |
| missing in OSM (no Commerzbank ATM ≤ 100 m) | 6: Friedrichstr. 88 SB, Lützowplatz SB, Friedrichshagen, Marzahn, Spandau, Tegel                                           | –                                                                                                 |
| OSM ATMs at no listed location              | –                                                                                                                          | 10 (4 in Brandenburg, outside the list; 6 in Berlin, e.g. Wilmersdorfer Str. 39, a closed branch) |
| ATM opening hours                           | none (only the branch's hours; no SB-zone hours)                                                                           | 7 of the 22 matched have their own hours                                                          |
| cash-deposit machine                        | 26 of 28                                                                                                                   | not tagged                                                                                        |
| wheelchair access                           | 28 of 28 (15 free, 6 partly, 7 not)                                                                                        | not in the app file                                                                               |
| staffed cash desk                           | 8 of 28                                                                                                                    | –                                                                                                 |
| terms                                       | reproduction or distribution of information or data needs Commerzbank's prior consent; private, non-commercial use allowed | ODbL                                                                                              |

`geldautomat` is false for 7 locations that all have `einzahlautomat` true and `costFreeATM` true
(e.g. Moabit, where OSM maps a Commerzbank ATM 11 m away). Most likely their only machine is a
combined deposit and withdrawal machine, but the pages do not say so.

## Found on the way

The live layer counts closed branches that kept `atm=yes` in OSM (`disused:amenity=bank`): 4 in
the area (Wilmersdorfer Str. 39 Commerzbank, 3 Postbank). Fix task S051.

## Recommendation

Keep OSM as the source: Commerzbank's terms do not allow republishing their data in the public
app without consent, and their pages add no ATM hours. They do add 6 missing locations,
deposit machines and wheelchair access. Two clean ways to get that in:

- Ask Commerzbank for consent to use the Berlin branch list (a request, not code).
- Add the 6 missing ATMs in OSM by surveying them (StreetComplete or the OSM editor). Copying
  them from Commerzbank's pages into OSM is not allowed either.
