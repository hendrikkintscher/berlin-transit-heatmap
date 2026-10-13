# Roadmap

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ (through PR #261). Everything built so far (groups 1–17, PRs #1–#263) is archived in archive/plan/roadmap-done-2026-10-13.md (project files); project memory's feature-history lists every PR.

**How work runs** (Hendrik, 2026-10-13): Hendrik picks each step. One thread builds that one step (PR, CI green, merge), reports, and stops. Nothing else is built without his pick. The milestones and steps below are in the agreed order (Hendrik, 2026-10-13 08:11: "Change the roadmap to the suggestion"); each step still waits for his pick.

**Ground rule: snappiness is the app's USP.** A tap must keep answering at once, on a phone too. No step may slow down taps, panning or the first map; anything heavy is precomputed in the build, loaded in the background, or optional. Every step reports its timings.

## Inbox

Hendrik's wishes given without a pick land here: one dated line each, in his words. They are moved to their milestone when the roadmap is next edited.

_Empty._

## Milestone 1: Clear trips on the map

**Next: 1.1**, waiting for Hendrik's go.

Make it obvious where a trip starts, where it ends and which way it goes.

- **1.1 Direction looks, options only** (Hendrik, 2026-10-13 07:45: "We need a clearer visual idea which direction we are going on the map, I imagine solving this by clearer symbols both at the start and the end, the Point of the second location is too small, should be the same size as our first "fixed" location, the connection path should indicate direction and also be more distinct to the already drawn "important Transport lines". Present me different solutions first"). Three trial looks behind a link option `path=a|b|c`, all with the destination point 22 px like the start; Hendrik gets screenshots of the same trip in each look. The default map does not change in this step.
  - A, pins and arrows: dark path with a white edge, arrowheads along it toward the destination.
  - B, flowing path: dashes moving toward the destination (about 10 frames a second), transit lines faded to about 0.2 while a trip shows.
  - C, Start and Ziel labels: the path shading from the accent purple to a destination colour, one arrowhead near the destination.
- **1.2 Direction look as default**: the look Hendrik picks from 1.1 becomes the default; the trial option and the other looks are removed.

## Milestone 2: Changes where they matter

- **2.1 "Heute anders" into Mehr** (Hendrik, 2026-10-13 07:36: "Heute Anders never as popup, only in the mehr Menu, there should open a box with all the info when tapped. For the map and connection view the information is already displayed when a connection has Änderungen, when those appear, make them clickable and open a popup with the relevant information. Same as now clicking the heute now popup does"). The chip and its popup go; Mehr gets a "Heute anders" entry that opens the full list; change notes on the trip card become tappable and open the same details for that line. Code: changes.ts, the #changes chip and panel in index.html, noteFor() for the trip card.

## Milestone 3: Easier map reading

- **3.1 Darker time rings**. Ring labels already pass (10 : 1 or better everywhere), but the 60-min ring line (#d6c8f2) is only 1.4 : 1 against the map. Proposed colours 15 #1a0848, 30 #3b1d86, 45 #6440b4, 60 #7a58c4 (all 3 : 1 or better, water included). Also check whether the chip bar or the trip card hides rings.

## Milestone 4: Faster first map

- **4.1 First map under 1.5 s on a fresh visit**. Done so far: the start page fetches the first timetable and the worker draws the first map ahead (#260, #261). Repeat visits open in about 0.75 s live; fresh visits measured 1.4–2.1 s from the cloud container. The remaining time is the app bundle (MapLibre, about 320 KB gzipped) and the page's setup before the first map. Untested: whether Safari downloads the first timetable twice when the page's and the worker's requests overlap.

## Milestone 5: Showcase refresh

Last, so the pictures show the finished looks from milestones 1 and 3.

- **5.1 New screenshots and sharepics**: retake the showcase screenshots (showcase/screens/) with the current default map, and re-render the German sharepics if they show the default map.

## Held

- **Other regions, Oldenburg / Weser-Ems first**: held until the domain and the timetable feed account are settled. Decided (Hendrik, 2026-10-12): one app, each region at its own address (`…/berlin/`, `…/oldenburg/`) with its own manifest, name and icon; one codebase and deploy with a data folder per region; favourites per region; own nightly build per region. Region-ready code is in `packages/routing/src/regions.ts` (#126). Details in archive/plan/regions.md.
- **Android and iOS app store deployment**: needs Hendrik's own developer accounts (Google Play one-time 25 USD with a two-week closed test, Apple 99 USD a year with review). Android would start as a TWA (archive/plan/android-notes.md), iOS needs a wrapper such as Capacitor.

## Not planned

- Android app and beta testing (Hendrik, 2026-10-13: "don't do android app and beta testing"). The beta plan is in archive/plan/beta-readiness.md.
- Fare zones on the map, sharing a picture of the map, "who can I reach" population figures, dark map and app shortcuts (Hendrik, 2026-10-12), kept in archive/plan/suggestions-2.md.
