# Changelog

What changed in the app and in the roadmap, newest first. The roadmap (ROADMAP.md, project copy plan/roadmap.md) holds only what is still to do; every roadmap edit adds its line here. This file is kept identical in the repo (CHANGELOG.md) and in the project files (plan/changelog.md).

## App versions

Each step ships as one PR and one version, tagged `vX.Y.Z` on merge. Versions up to 0.7 were assigned afterwards from the PR history.

| Version | Live  | What                                                                                              | PRs       |
| ------- | ----- | ------------------------------------------------------------------------------------------------- | --------- |
| 0.13.0  | 10-14 | First map under 1.5 s on a fresh visit (1.36 s median, was 2.53 s); `?timing` box                 | #315      |
| 0.12.0  | 10-14 | Closing Treffpunkt keeps the second place as the Ziel                                             | #312      |
| 0.11.0  | 10-14 | Darker time rings, 3 : 1 against land and water                                                   | #308      |
| 0.10.11 | 10-14 | "Heute anders" retries a failed changes download when Mehr opens                                  | #305      |
| 0.10.10 | 10-14 | The footpath loading line shows 5 s at most; a short note when the footpaths arrive later         | #302      |
| 0.10.9  | 10-14 | "Heute anders" entry in Mehr from the start, with a loading line until the changes file is in     | #299      |
| 0.10.8  | 10-14 | The footpath loading line no longer overlaps the start card on a short screen                     | #295      |
| 0.10.7  | 10-14 | The drawer's kept list re-searches other lines with the footpaths; no list cut off by the refresh | #292      |
| 0.10.6  | 10-14 | "Heute anders": two-line note on top, one-change rows always show their end date                  | #289      |
| 0.10.5  | 10-14 | The drawer keeps its list when the card refreshes with the same trip (about 12 searches saved)    | #286      |
| 0.10.4  | 10-13 | "Heute anders": note on top, one row per line, lines with several changes unfold on a tap         | #283      |
| 0.10.3  | 10-13 | The drawer also lists faster connections on other lines, found in the background                  | #281      |
| 0.10.2  | 10-13 | The countdown moves on to the next connection past the full hour, from the loaded file            | #279      |
| 0.10.1  | 10-13 | "Heute anders" only in Mehr; change notes on the trip card open their line's changes              | #277      |
| 0.10.0  | 10-13 | Later connections fill in while pulling the drawer and reach an hour ahead                        | #276      |
| 0.9.2   | 10-13 | Version line in German and English, short commit shown as text                                    | #275      |
| 0.9.1   | 10-13 | Automatic tag `vX.Y.Z` for each merge that bumps the version                                      | #274      |
| 0.9.0   | 10-13 | App shows its version in the Mehr menu; git tag per step                                          | #272      |
| 0.8.0   | 10-13 | Clear trips: direction on the map, Start and Ziel rows, bottom drawer                             | #266–#270 |
| 0.7     | 10-13 | Faster first trip and first map                                                                   | #257–#261 |
| 0.6     | 10-13 | Review track: first open, lighter maps, looks, data versions, smoke test, Rings as default look   | #199–#254 |
| 0.5     | 10-12 | Faster loading, time panel and trip card redesign, real arrivals, Start ⇄ Ziel, Bis N Min.        | #151–#197 |
| 0.4     | 10-12 | UI overhaul: chips, top bar, calm map, rename "Wohin jetzt?", search bar, street list             | #92–#145  |
| 0.3     | 10-12 | Binary timetables, speed budget, Wohnlage, real dates, Heute anders, live status                  | #50–#90   |
| 0.2     | 10-11 | Menu, German UI, meeting point, favourites, trip on tap, footpaths, bike modes                    | #15–#47   |
| 0.1     | 10-11 | Alpha: web app, timetable build, routing, Pages, search                                           | #1–#10    |

## Roadmap versions

- **V1.38** (2026-10-14): Hendrik's wish "adjust personal preferences in color coding for heatmap" added to LATER.md as Personal colour coding for the heatmap (planned for later, not scheduled). No step changed. Next in order: 0.13.1 Footpaths start downloading sooner.
- **V1.37** (2026-10-14): the changelog moved out of the roadmap into CHANGELOG.md (plan/changelog.md), together with the app versions table and the done groups 1–18 from the archive; new LATER.md (plan/later.md) for items planned for much later: Hendrik's wish "work on UI for desktop browsers", other regions, own web address and app store deployment (from the archived Held list), the ideas set aside on 2026-10-12 and the not planned Android app and beta testing. No step changed. Next in order: 0.13.1 Footpaths start downloading sooner.
- **V1.36** (2026-10-14): Hendrik's wish "a layout and UI consistency check on different devices and browsers" placed as 0.15.11 Layout check on devices and browsers, last in 0.15 Design decisions so it checks the finished looks before the showcase refresh and 1.0. The Inbox side note from 0.13.0 (base map label fonts) moved to 0.13.1c; the Inbox is empty. Next in order: 0.13.1 Footpaths start downloading sooner.
- **V1.35** (2026-10-14): Hendrik's two wishes placed: "a link option like [URL]/fresh" as 0.13.5 Fresh-start link, and "give them a tiny bit more room" (UI elements at the left and right edges) as 0.15.0, first step of the new milestone 0.15 Design decisions. That milestone brings the optional design list back before 1.0 (Hendrik: "Put back the optional Design choices again on the roadmap somewhere before version 1"): D8 → 0.15.1, D7 → 0.15.2, D2 → 0.15.3, D1 → 0.15.4, D3 → 0.15.5, D9–D11 → 0.15.6–0.15.8, D4 → 0.15.9, D5 → 0.15.10, D6 → 0.16.1. OPTIONAL-DESIGN.md is removed; its last version is archived as archive/plan/optional-design-v1.2-2026-10-14.md. Showcase refresh is now 0.16, still last. A side note from 0.13.0 (base map label fonts) added to the Inbox. Next in order: 0.13.1 Footpaths start downloading sooner.
- **V1.34** (2026-10-14): 0.13.0 First map under 1.5 s on a fresh visit done (#315): the app's layers go on the map once its style is in, not after every base-map tile and label font, so the time rings show about a second sooner. Live at 360×740 (headless, 10 fresh visits): first map 1.36 s median (1.21–1.65 s), was 2.53 s (2.29–3.26 s); with 9 Mbit/s 1.39 s, was 2.41 s. A link with `?timing` shows a small box with the first map, base map, the first timetable's downloads (page and worker) and tap-to-trip times, for a check on a phone: in Chrome the timetable comes down once; Safari was not testable here. Taps in the first seconds: 150–500 ms against about 220 ms later, peaks while the footpaths arrive. The bundle stays (main.js is almost all MapLibre). Next in order: 0.13.1 Footpaths start downloading sooner.
- **V1.33** (2026-10-14): Hendrik's wish "long press moves the anchor point to the chosen location" placed as new milestone 0.14 Map handling, step 0.14.0 Long press moves the anchor (0.14 Showcase refresh now 0.15, still last). The Inbox side note from 0.12.0 (the floating Treffpunkt button brings back the closed person until all starts are cleared; a new person needs "+ Person" after that) moved to the optional list as D10c, since D10 removes that button; the Inbox is empty. Next in order: 0.13.0 First map under 1.5 s on a fresh visit.
- **V1.32** (2026-10-14): 0.12.0 Closing Treffpunkt keeps the second place done (#312): the banner's ✕ keeps the second place as the pin (Ziel), so the card shows the trip between the two places; Treffpunkt on the card or the floating button brings that person back, names included. Measured at 360×740: ✕ to trip card about 0.8 s (the same map recompute as before). Milestone 0.12 is finished. Next in order: 0.13.0 First map under 1.5 s on a fresh visit.
- **V1.31** (2026-10-14): Hendrik reviewed the steps on cards: 0.11.1 Status lines keep the map clear moved to the optional list as D8 (milestone 0.11 is finished with 0.11.0); the Treffpunkt looks 0.12.0, 0.12.1 and 0.12.3 moved there as D9–D11; 0.12.2 Closing Treffpunkt keeps the second place stays and is now 0.12.0; 0.14 Showcase refresh stays. 0.13 and 1.0 are not design and stay. Next in order: 0.12.0 Closing Treffpunkt keeps the second place.
- **V1.30** (2026-10-14): new milestone Optional design decisions with its own list OPTIONAL-DESIGN.md (plan/optional-design.md). Hendrik: "All of the current roadmaps are part of something I would call optional design decisions for now, lump them together in a separate document". The seven Inbox items (example map on the first screen, colour fill for first-time visitors, question entries, places layer, two start points side by side, sharepic per use case, ring widths) moved there as D1–D7; the Inbox is empty. Other steps are reviewed with Hendrik one at a time. Next in order: 0.11.1 Status lines keep the map clear.
- **V1.29** (2026-10-14): 0.11.0 Darker time rings done (#308): rings 15 #1a0848, 30 #3b1d86, 45 #6440b4, 60 #7553c0 (a touch darker than planned so the 60-min ring is 3 : 1 on the app's water too), all opaque; a test checks 3 : 1 on land and water. The chip bar hides only the top strip and the trip card the bottom quarter; nothing moved. Hendrik asked on a card whether 0–5 min stays the darkest green in the colour fill. Timings unchanged (colour only). Next in order: 0.11.1 Status lines keep the map clear.
- **V1.28** (2026-10-14): Hendrik's wish "changing direction should not switch to Ankunftszeit mode" placed as 0.13.3 Changing direction keeps the departure time, next to the anchor/pin swap step (old 0.13.3 Timetable windows check now 0.13.4). Next in order: 0.11.0 Darker time rings.
- **V1.27** (2026-10-14): 0.10.11 "Heute anders" retries a failed changes download done (#305): after a failed load, each Mehr open fetches changes.json once more, quietly; on success the entry shows (87 ms after the tap, local test). Nothing runs on the first map or on taps. Milestone 0.10 is finished. Next in order: 0.11.0 Darker time rings.
- **V1.26** (2026-10-14): two Inbox notes from 0.10.10 placed as 0.11.1 Status lines keep the map clear and 0.13.1 Footpaths start downloading sooner (old 0.13.1–0.13.2 now 0.13.2–0.13.3); Hendrik's two Treffpunkt wishes placed as 0.12.2 Closing Treffpunkt keeps the second place and 0.12.3 Treffpunkt opens in its own map look. Next in order: 0.10.11 "Heute anders" retries a failed changes download.
- **V1.25** (2026-10-14): 0.10.10 Footpath loading line on a slow download done (#302): the line shows for 5 s at most, the thin bar keeps the download's progress, and when the footpaths arrive later the redone map brings a short note ("Fußwege geladen, die Zeiten sind jetzt genauer."). Measured at 150 KB/s: line 23 s → 5 s; a fast download looks as before. Next in order: 0.10.11 "Heute anders" retries a failed changes download.
- **V1.24** (2026-10-14): the Inbox note from step 0.10.9 placed as new step 0.10.11 "Heute anders" retries a failed changes download. Next in order: 0.10.10 Footpath loading line on a slow download.
- **V1.23** (2026-10-14): 0.10.9 "Heute anders" entry in Mehr from the start done (#299): the entry is there as soon as Mehr opens; before the changes file is in, a tap opens the box with a loading line that fills when the file arrives, or says all runs as usual. Next in order: 0.10.10 Footpath loading line on a slow download.
- **V1.22** (2026-10-14): roadmap made lean (Hendrik: "only how to use it and detailed enough explanations for the steps"). Moved to archive/plan/roadmap-v1.21-full-2026-10-14.md: past versions table, changelog V1.0–V1.20, Held and Not planned, provenance notes. No step changed. Next in order: 0.10.9 "Heute anders" entry in Mehr from the start.
- **V1.21** (2026-10-14): the Inbox note from step 0.10.8 (footpath loading line stays up during a slow download) placed as new step 0.10.10 Footpath loading line on a slow download; 0.10.8 added to the past versions table; Inbox emptied. Next in order: 0.10.9 "Heute anders" entry in Mehr from the start.
- **V1.20** (2026-10-14): 0.10.8 Start card lines overlap while footpaths load done (#295): it showed only on a short screen (phone held sideways, 740×360), never at 360×740; while the start card is up, the "Fußwege werden geladen…" line is now its last row, and it goes back to the bottom panel when the card goes. Next in order: 0.10.9 "Heute anders" entry in Mehr from the start.
- **V1.19** (2026-10-14): the two Inbox notes from step 0.10.7 placed: "Heute anders entry in Mehr appears late" as new step 0.10.9 "Heute anders" entry in Mehr from the start, "map frames take 250–400 ms in the first ~7 s, measure tap delay on a real phone" as substep 0.13.0 c (First map under 1.5 s); Inbox emptied. Next in order: 0.10.8 Start card lines overlap while footpaths load.
- **V1.18** (2026-10-14): 0.10.7 Kept drawer list after the footpaths load done (#292): a kept list quietly searches the other lines again with the new walks and swaps in the finished list; the footpath refresh waits (up to 4 s) for a list still being searched, and a pull during the refresh asks once, right after it (pull to full list 1.2–1.3 s → 0.5 s, one search instead of two); "Heute anders" needed no change (it opens 3–90 ms after the tap; the ~2 s was the test tool waiting for software-drawn map frames). Next in order: 0.10.8 Start card lines overlap while footpaths load.
- **V1.17** (2026-10-14): the two Inbox notes from step 0.10.6 placed: "Heute anders slow while the first map loads" as substep 0.10.7 c (same busy moment as b), "footpath loading line drawn over the start card hint" as new step 0.10.8 Start card lines overlap while footpaths load; Inbox emptied. Next in order: 0.10.7 Kept drawer list after the footpaths load.
- **V1.16** (2026-10-14): 0.10.6 "Heute anders" box polish done (#289): the note at the top is two short sentences (5 lines down to 2 at phone size), and a one-change row cuts the stretch short instead of its end date, so "bis 18.10." stays in view. Next in order: 0.10.7 Kept drawer list after the footpaths load.
- **V1.15** (2026-10-14): the two Inbox notes from step 0.10.5 placed as 0.10.7 Kept drawer list after the footpaths load (a. other-line rows redone with fresh walks, b. early pull no longer loses the race with the footpath redraw); Inbox emptied. Next in order: 0.10.6 "Heute anders" box polish.
- **V1.14** (2026-10-14): 0.10.5 Drawer list asked for only once done (#286): the second ask came from the map being redone with the footpaths, which re-taps the place; the drawer now keeps its list and picked row when the vehicles stay the same (rows at the same stops take the new walks) and asks again only when the trip changes, a setting changed or the first search was cut short; saves about 12 route searches per opening in that case. Next in order: 0.10.6 "Heute anders" box polish.
- **V1.13** (2026-10-14): the two Inbox notes from step 0.10.4 placed as 0.10.6 "Heute anders" box polish (a. shorter note at the top, b. end date visible on one-change rows); Inbox emptied. Next in order: 0.10.5 Drawer list asked for only once.
- **V1.12** (2026-10-13): 0.10.4 Shorter "Heute anders" box done (#283): the explanation note is at the top; the whole day lists one row per line, cut to one line, and a line with several changes unfolds on a tap (Sa 17.10.: list 733 → 401 px). Next in order: 0.10.5 Drawer list asked for only once.
- **V1.11** (2026-10-13): the two Inbox notes from step 0.10.3 sorted: "drawer list asked for a second time" placed as 0.10.5 Drawer list asked for only once; "two rows with the same arrival minute" discarded (Hendrik). Inbox emptied. Next in order: 0.10.4 Shorter "Heute anders" box.
- **V1.10** (2026-10-13): 0.10.3 Faster other lines in the drawer done (#281): after the instant list of the shown lines' later trips, the worker searches one connection at a time on any line and adds those that beat a row (a tap or new map goes first); each row keeps its line badges.
- **V1.9** (2026-10-13): the two Inbox notes from step 0.10.2 placed: "bump both package.json versions" as a rule under Versioning, and "slightly worse long trips late in the extra hour" as substep 0.13.2 c (Timetable windows check); Inbox emptied. Next in order: 0.10.3 Faster other lines in the drawer.
- **V1.8** (2026-10-13): 0.10.2 Countdown moves on after the full hour done (#279): when the shown connection leaves, the card takes the next one from the loaded hour file also after the full hour (up to an hour past it); before, the route search ignored departures after the file's hour.
- **V1.7** (2026-10-13): the three Inbox notes from steps 0.10.0 and 0.10.1 placed as 0.10.2 Countdown moves on after the full hour, 0.10.3 Faster other lines in the drawer and 0.10.4 Shorter "Heute anders" box; milestone 0.10 reopened for them, next in order; Inbox emptied.
- **V1.6** (2026-10-13): 0.10.1 "Heute anders" into Mehr done (#277): the notice above the card is gone; Mehr has a "Heute anders" entry that opens the day's full list, and a change note on the trip card opens its line's changes; milestone 0.10 closed.
- **V1.5** (2026-10-13): 0.10.0 Later connections while pulling done (#276): the list fills in as the pull starts and runs for the hour after the shown connection (the hour's file already holds the next hours' trips, so nothing extra loads).
- **V1.4** (2026-10-13): 0.9.2 Version line in German and English done (#275, tag `v0.9.2`); milestone 0.9 closed.
- **V1.3** (2026-10-13): 0.9.1 Automatic tag per version done (#274, tag `v0.9.1` set by the new workflow); Hendrik no longer tags by hand.
- **V1.2** (2026-10-13): the two Inbox notes from step 0.9.0 placed as 0.9.1 Automatic tag per version and 0.9.2 Version line in German and English; milestone 0.9 reopened for them, next in order.
- **V1.1** (2026-10-13): 0.9.0 App shows its version done (#272, tag `v0.9.0`); milestone 0.9 closed. From here every step's PR bumps the version in package.json and tags its merge.
- **V1.0** (2026-10-13): versioning introduced for the app and the roadmap; milestones renamed to app versions 0.9–1.0 with steps and substeps; the four Inbox notes of 2026-10-13 placed (0.10.0, 0.12, 0.13.1, 0.13.2); Clear trips (old milestone 1) done as 0.8.0.

## Before versioning: done groups 1–18

The work up to app 0.8.0 (PRs #1–#270), one line per roadmap group, as recorded when the roadmap was restructured into milestones on 2026-10-13. Full write-ups stay in the archive (project files): archive/plan/roadmap-full-2026-10-12.md, roadmap-full-2026-10-13.md, roadmap-done-2026-10-13.md and roadmap-v1.21-full-2026-10-14.md; archive/memory-2026-10-13/feature-history.md lists every feature PR.

### 1. Interface and usability

Done: burger menu, German by default with English switch, search limited to the covered area (#15), snappier search (#96), addresses in suggestions (#122), street names in every search box (#142).

### 2. New map layers

Done: stop-frequency and transit-desert layers (#16).

### 3. Comparing places

Done: meeting point for two starts and favourite places with a location score (#17), suggested meeting points and search result actions (#35), meeting scale in extra minutes (#37), three to five starts (C1) and the Wohnlage-Karte (C2) (#64), fairer suggestions by slowest plus average trip (#93), "Lieblingsort" toggle (#118), meeting headline wraps between people (#252).

### 4. Time of day and weekends

Done: hour and weekend picker (#18), exact minutes and "Jetzt" (#160).

### 5. Everyday use on the phone

Done: Mein Standort, share, transparency slider, outlines, data note, first-run help and small polish (#21), 5-minute outlines and colours under the streets (#23), round buttons and bottom legend (#40).

### 6. Trips you can trust

Done: trip on tap, typical time, Ankommen and compare two times (#24), "Nächste" (#32, #62), place kept when settings change (#55), "Bis wann heim?" (C3, #66), leave-in countdown on the card (#85), no Google Maps links (#145), real arrival times (#183), shorter platform changes (#184), Start ⇄ Ziel (#187), no flicker on another destination (#213), "Bis wann heim?" limits of 1 h and 1 h 30 (#214), the trip card round with drawer and detailed view (#217, #218, #220), less walking on equal arrival (#237).

### 7. Reading the map

Done: route apart from the Lines layer, water drawn over the colours, street-level fade and house numbers (#27), colours off by default (#71), quiet footpaths (#73), fainter and dashed outlines (#76, #81), lines on real tracks (#99, #102), connection without border (#108), Ringbahn course and colour scale green to 20 min, yellow from 25 (#214).

### 8. Realistic walking on real footpaths

Done: walking on the OSM footpath network (walk.bin, Gehtempo setting, up to 30 min walks where nothing is near) and walks drawn along the footpaths (#45); walking default 5 km/h since the connection test.

### 9. More ways to travel

Done: step-free mode (#42), bike + transit and bike only (#47).

### 10. Performance

Done: binary timetables (#50), CI speed budget (#57), url.ts split (#59), publish only changed files (#95), next hour preloaded and tidy offline cache (#103).

### 11. What's running now

Done: today's actual service with construction and Ersatzverkehr (#78), "Heute anders" on the trip card (#98).

### 12. UI overhaul

Done: chip row (#92), chip bar rounds (#108, #111, #114), edge-to-edge top bar (#120), calmer default map (#129), rename to "Wohin jetzt?" (#134), line widths (#135, #139), permanent search bar (#153), time sheet and trip card redesign (#174).

### 13. Wider area and other regions

Done: Potsdam and the commuter belt (C6, #69), region-ready code with Berlin as one entry in `packages/routing/src/regions.ts` (#126).

Other regions are held: see LATER.md.

### 14. Android app and beta readiness

Not planned (Hendrik, 2026-10-13); items 1 (name under the icon), 6 (smoke test, #241) and 7 (basemap offline, #169) of the beta list were done anyway. See LATER.md.

### 15. Third suggestions list

Items keep their ids from archive/plan/suggestions-3.md. Done: bug bundle (A1, #151), walking network loads after the first map (B1, #155), lean deploy (B2, #156), larger tap card buttons (C2, #174), "Bis N Min." (D1, #189), faster first load (B4 + B5, #193), lighter taps (B6, #197), background downloads (P1 + P2, #199), sturdier publish (#201), faster map passes (P4–P7, #205), Wohnlage memory (B7 + P9, #210), offline timetable and cache-first data (B8 + P3, #234), notice, search and favourites polish (C5–C8, #236), named starts (D2, #240), smoke test and broader speed check (B9 + P10, #241), timetable size ceiling and own schedule (B10, #243), code health (E1, #245, with the home-map time fix #246), walk.bin v2 (P8, #247).

Done as well: C9 default view, Rings (#254).

### 16. App stores and showcase

- **Android and iOS app store deployment**: not started, see LATER.md.
- **Showcase material**: Done (2026-10-13): 10 live screenshots in showcase/screens/, a German comparison with existing maps in showcase/vergleich-de.md, and both German sharepics re-rendered.

### 17. Review track

Four reviews (Hendrik, 2026-10-12): UI intuitiveness, visual consistency, code and runtime, docs and chats cleanup. Findings are in plan/reviews/ (project files, README.md is the index). Done: all UI and looks findings U1–U14 and V1–V13 (PR #203–#233), all code findings P1–P10 (in group 15), and the whole docs and chats cleanup K1–K23 (#245, #250, #251, archive pass, memory consolidation). Open: nothing.

### 18. Clear trips on the map (app 0.8.0)

Done (2026-10-13): three trial direction looks (#266), Hendrik picked C: Start/Ziel ends and an arrow per ride as default (#267), smaller arrows on rides only (#268), trip card with Start and Ziel rows, ⇅ and rings (#269), bottom drawer with details and later connections (#270).
