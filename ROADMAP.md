# Roadmap

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/. Done items are listed in one line per group; the full write-ups are in archive/plan/roadmap-full-2026-10-13.md (project files), and project memory's feature-history lists every PR. The **Up next** section lists the open items; nothing is built until Hendrik picks it.

## Inbox

Hendrik's instructions land here, written by the coordinator into plan/roadmap.md (project files): one dated line each, in his words. The roadmap editor checks this section at the start of every turn and before naming each next step, moves each line to its place in the roadmap, and removes it from here.

_Empty._

## Up next

**Paused** (Hendrik, 2026-10-13 07:51: "I am not so happy with how we are going forward, I need more control over what we are building next. So after the next commit, stop the workers, put everything they have on their plate to the roadmap and resolve their threads to work on a model how we coordinate going forward with this project"). The standing go is withdrawn: nothing is built until Hendrik picks it. Live through PR #261. Done in the last round: first tap card without waiting for the walking network (#257, #258) and the first part of a faster first map (#260, #261).

**Open items, in no order** (none is started unless noted; each waits on Hendrik's pick):

- **Faster first map** (partly done, #260, #261). Repeat visits open in about 0.75 s live; fresh visits measured 1.4–2.1 s from the cloud container, not yet proven under 1.5 s. The remaining time is the app bundle (MapLibre, about 320 KB gzipped) and the page's setup before the first map. Untested: whether Safari downloads the first timetable twice when the page's and the worker's requests overlap.
- **Direction on the map, options first** (Hendrik, 2026-10-13 07:45: "We need a clearer visual idea which direction we are going on the map, I imagine solving this by clearer symbols both at the start and the end, the Point of the second location is too small, should be the same size as our first "fixed" location, the connection path should indicate direction and also be more distinct to the already drawn "important Transport lines". Present me different solutions first"). Not started. Proposed: three trial looks behind a link option `path=a|b|c`, all with the destination point 22 px like the start, shown to Hendrik as screenshots of the same trip before anything changes by default.
  - A, pins and arrows: dark path with a white edge, arrowheads along it toward the destination.
  - B, flowing path: dashes moving toward the destination (about 10 frames a second), transit lines faded to about 0.2 while a trip shows.
  - C, Start and Ziel labels: the path shading from the accent purple to a destination colour, one arrowhead near the destination.
- **"Heute anders" into Mehr** (Hendrik, 2026-10-13 07:36: "Heute Anders never as popup, only in the mehr Menu, there should open a box with all the info when tapped. For the map and connection view the information is already displayed when a connection has Änderungen, when those appear, make them clickable and open a popup with the relevant information. Same as now clicking the heute now popup does"). Not started. Code: changes.ts, the #changes chip and panel in index.html, noteFor() for the trip card.
- **Rings readability** (measured, nothing changed). Ring labels pass (10 : 1 or better everywhere), but the 60-min ring line (#d6c8f2) is only 1.4 : 1 against the map. Proposed ring colours 15 #1a0848, 30 #3b1d86, 45 #6440b4, 60 #7a58c4 (all 3 : 1 or better, water included). Not checked yet: whether the chip bar or the trip card hides rings.
- **Showcase refresh**: retake the showcase screenshots with the Rings default, and re-render the German sharepics if they show the default map.

**Not in this plan:** Android app and beta testing (Hendrik, 2026-10-13: "don't do android app and beta testing"); app store deployment (group 16), which needs Hendrik's own developer accounts; the region addresses and Oldenburg data (group 13), held until the domain and the timetable feed account are settled.

**Threads:** the "Roadmap editor" and "Roadmap builder" threads stopped on 2026-10-13 07:51; how work is coordinated from here is being worked out with Hendrik.

**Rules.** Instructions go into the roadmap only, through the Inbox (Hendrik, 2026-10-12); the editor hands an item to the builder only when it judges it the next thing to do, and the builder takes work only from the editor. The standing go of 2026-10-13 00:31 is withdrawn (Hendrik, 2026-10-13 07:51): Hendrik picks what is built next.

**Not planned** (Hendrik, 2026-10-12), kept in archive/plan/suggestions-2.md: fare zones on the map (C5), sharing a picture of the map (C7), "who can I reach" population figures (C4), dark map and app shortcuts (C9).

**Ground rule: snappiness is the app's USP.** A tap must keep answering at once, on a phone too. No feature may slow down taps, panning or the first map; anything heavy is precomputed in the build, loaded in the background, or optional.

## 1. Interface and usability

Done: burger menu, German by default with English switch, search limited to the covered area (#15), snappier search (#96), addresses in suggestions (#122), street names in every search box (#142).

## 2. New map layers

Done: stop-frequency and transit-desert layers (#16).

## 3. Comparing places

Done: meeting point for two starts and favourite places with a location score (#17), suggested meeting points and search result actions (#35), meeting scale in extra minutes (#37), three to five starts (C1) and the Wohnlage-Karte (C2) (#64), fairer suggestions by slowest plus average trip (#93), "Lieblingsort" toggle (#118), meeting headline wraps between people (#252).

## 4. Time of day and weekends

Done: hour and weekend picker (#18), exact minutes and "Jetzt" (#160).

## 5. Everyday use on the phone

Done: Mein Standort, share, transparency slider, outlines, data note, first-run help and small polish (#21), 5-minute outlines and colours under the streets (#23), round buttons and bottom legend (#40).

## 6. Trips you can trust

Done: trip on tap, typical time, Ankommen and compare two times (#24), "Nächste" (#32, #62), place kept when settings change (#55), "Bis wann heim?" (C3, #66), leave-in countdown on the card (#85), no Google Maps links (#145), real arrival times (#183), shorter platform changes (#184), Start ⇄ Ziel (#187), no flicker on another destination (#213), "Bis wann heim?" limits of 1 h and 1 h 30 (#214), the trip card round with drawer and detailed view (#217, #218, #220), less walking on equal arrival (#237).

## 7. Reading the map

Done: route apart from the Lines layer, water drawn over the colours, street-level fade and house numbers (#27), colours off by default (#71), quiet footpaths (#73), fainter and dashed outlines (#76, #81), lines on real tracks (#99, #102), connection without border (#108), Ringbahn course and colour scale green to 20 min, yellow from 25 (#214).

## 8. Realistic walking on real footpaths

Done: walking on the OSM footpath network (walk.bin, Gehtempo setting, up to 30 min walks where nothing is near) and walks drawn along the footpaths (#45); walking default 5 km/h since the connection test.

## 9. More ways to travel

Done: step-free mode (#42), bike + transit and bike only (#47).

## 10. Performance

Done: binary timetables (#50), CI speed budget (#57), url.ts split (#59), publish only changed files (#95), next hour preloaded and tidy offline cache (#103).

## 11. What's running now

Done: today's actual service with construction and Ersatzverkehr (#78), "Heute anders" on the trip card (#98).

## 12. UI overhaul

Done: chip row (#92), chip bar rounds (#108, #111, #114), edge-to-edge top bar (#120), calmer default map (#129), rename to "Wohin jetzt?" (#134), line widths (#135, #139), permanent search bar (#153), time sheet and trip card redesign (#174).

## 13. Wider area and other regions

Done: Potsdam and the commuter belt (C6, #69), region-ready code with Berlin as one entry in `packages/routing/src/regions.ts` (#126).

**Held: other regions, Oldenburg / Weser-Ems first.** Decided (Hendrik, 2026-10-12): one app, each region at its own address (`…/berlin/`, `…/oldenburg/`) with its own manifest, name and icon; one codebase and deploy with a data folder per region; favourites per region; own nightly build per region. Timetables from the Connect GTFS feed (licence and access to check), Oldenburg plus about 40 km including Bremen, without live status and Berlin-only extras at first. Not started until the domain and the timetable feed account are settled. Details in archive/plan/regions.md.

## 14. Android app and beta readiness

**Not planned** (Hendrik, 2026-10-13). Beta readiness was planned as packages A (minimal), B (recommended) and C (everything) plus an address choice; items 1 (name under the icon), 6 (smoke test, PR #241) and 7 (basemap offline, PR #169) are already done. The full list is in archive/plan/beta-readiness.md. The native Android options (TWA, Capacitor, Kotlin) and ways to ship (Google Play, APK, F-Droid) are in archive/plan/android-notes.md.

## 15. Third suggestions list

Items keep their ids from archive/plan/suggestions-3.md. Done: bug bundle (A1, #151), walking network loads after the first map (B1, #155), lean deploy (B2, #156), larger tap card buttons (C2, #174), "Bis N Min." (D1, #189), faster first load (B4 + B5, #193), lighter taps (B6, #197), background downloads (P1 + P2, #199), sturdier publish (#201), faster map passes (P4–P7, #205), Wohnlage memory (B7 + P9, #210), offline timetable and cache-first data (B8 + P3, #234), notice, search and favourites polish (C5–C8, #236), named starts (D2, #240), smoke test and broader speed check (B9 + P10, #241), timetable size ceiling and own schedule (B10, #243), code health (E1, #245, with the home-map time fix #246), walk.bin v2 (P8, #247).

Done as well: C9 default view, Rings (#254).

## 16. App stores and showcase

- **Android and iOS app store deployment**: not started; needs Hendrik's own developer accounts (Google Play one-time 25 USD with a two-week closed test, Apple 99 USD a year with review). Android would start as a TWA (archive/plan/android-notes.md), iOS needs a wrapper such as Capacitor.
- **Showcase material**: Done (2026-10-13): 10 live screenshots in showcase/screens/, a German comparison with existing maps in showcase/vergleich-de.md, and both German sharepics re-rendered.

## 17. Review track

Four reviews (Hendrik, 2026-10-12): UI intuitiveness, visual consistency, code and runtime, docs and chats cleanup. Findings are in plan/reviews/ (project files, README.md is the index). Done: all UI and looks findings U1–U14 and V1–V13 (PR #203–#233), all code findings P1–P10 (in group 15), and the whole docs and chats cleanup K1–K23 (#245, #250, #251, archive pass, memory consolidation). Open: nothing.
