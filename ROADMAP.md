# Roadmap V1.17

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.10.6** (through PR #289). Everything built so far is archived in archive/plan/roadmap-done-2026-10-13.md (project files); the roadmap before V1 is in archive/plan/roadmap-v0-2026-10-13.md.

**How work runs** (Hendrik, 2026-10-13): Hendrik picks each step. One thread builds that one step (PR, CI green, merge), reports, and stops. Nothing else is built without his pick. The order below is a proposal.

**Ground rule: snappiness is the app's USP.** A tap must keep answering at once, on a phone too. No step may slow down taps, panning or the first map; anything heavy is precomputed in the build, loaded in the background, or optional. Every step reports its timings.

## Versioning

**The app** uses semantic versions `MAJOR.MINOR.PATCH`, staying below 1.0 until the Berlin app is finished.

- A **milestone** is one minor version (0.9, 0.10, …).
- A **step** is one PR that ships as a patch inside that milestone. The first step ships as `0.N.0`, the next as `0.N.1`, and so on. Its id is that version.
- A **substep** is a part of a step, lettered `a`, `b`, `c`, and ships with its step in the same PR and version.
- Versions below are guesses. If Hendrik reorders steps, they are renumbered in the next roadmap version.
- **1.0.0** is the finished Berlin app: every V1 milestone live and the showcase refreshed. Other regions would start after it (1.x or 2.0).
- Bug fixes between steps bump the patch of the milestone that is live.
- Every step bumps the version in **both** package.json files, the root one and packages/web/package.json, so they always match (from the 0.10.2 thread, 2026-10-13: the root one had stayed on 0.10.0).
- **Tags** are automatic: when a merge to main changes the version in packages/web/package.json, the workflow "Tag version" (.github/workflows/tag-version.yml) tags that merge `vX.Y.Z` if the tag does not exist yet. Nobody tags by hand; run the workflow by hand only to catch up a missing tag.

**The roadmap** is versioned on its own: `V1.0`, `V1.1`, … Every edit that adds, removes, reorders or finishes a step bumps the second number. A full reorganisation makes `V2.0`. Each version gets a line in the changelog at the bottom.

**Past versions**, assigned afterwards from the PR history:

| Version | Live      | What                                                                                            | PRs       |
| ------- | --------- | ----------------------------------------------------------------------------------------------- | --------- |
| 0.1     | 10-11     | Alpha: web app, timetable build, routing, Pages, search                                         | #1–#10    |
| 0.2     | 10-11     | Menu, German UI, meeting point, favourites, trip on tap, footpaths, bike modes                  | #15–#47   |
| 0.3     | 10-12     | Binary timetables, speed budget, Wohnlage, real dates, Heute anders, live status                | #50–#90   |
| 0.4     | 10-12     | UI overhaul: chips, top bar, calm map, rename "Wohin jetzt?", search bar, street list           | #92–#145  |
| 0.5     | 10-12     | Faster loading, time panel and trip card redesign, real arrivals, Start ⇄ Ziel, Bis N Min.      | #151–#197 |
| 0.6     | 10-13     | Review track: first open, lighter maps, looks, data versions, smoke test, Rings as default look | #199–#254 |
| 0.7     | 10-13     | Faster first trip and first map                                                                 | #257–#261 |
| 0.8.0   | 10-13     | Clear trips: direction on the map, Start and Ziel rows, bottom drawer                           | #266–#270 |
| 0.9.0   | 10-13     | App shows its version in the Mehr menu; git tag per step                                        | #272      |
| 0.9.1   | 10-13     | Automatic tag `vX.Y.Z` for each merge that bumps the version                                    | #274      |
| 0.9.2   | 10-13     | Version line in German and English, short commit shown as text                                  | #275      |
| 0.10.0  | 10-13     | Later connections fill in while pulling the drawer and reach an hour ahead                      | #276      |
| 0.10.1  | 10-13     | "Heute anders" only in Mehr; change notes on the trip card open their line's changes            | #277      |
| 0.10.2  | 10-13     | The countdown moves on to the next connection past the full hour, from the loaded file          | #279      |
| 0.10.3  | 10-13     | The drawer also lists faster connections on other lines, found in the background                | #281      |
| 0.10.4  | 10-13     | "Heute anders": note on top, one row per line, lines with several changes unfold on a tap       | #283      |
| 0.10.5  | 10-14     | The drawer keeps its list when the card refreshes with the same trip (about 12 searches saved)  | #286      |
| 0.10.6  | 10-14 now | "Heute anders": two-line note on top, one-change rows always show their end date                | #289      |

## Inbox

Hendrik's wishes given without a pick land here: one dated line each, in his words. They are moved to their milestone in the next roadmap version.

## 0.10 Trip drawer and changes, follow-ups

Reopened for the three notes Hendrik gave after 0.10.0 and 0.10.1, plus notes from steps 0.10.3 to 0.10.6; 0.10.2 to 0.10.6 are done. Next in order.

- **0.10.7 Kept drawer list after the footpaths load** (from step 0.10.5, 2026-10-14).
  - a. Fresh other-line rows: "in a kept drawer list, other-line rows boarding at a different platform keep older walking times (can be ~1 min off); a fresh search after footpaths load may also find a slightly different other-line row". Option: keep the list but quietly redo only the other-line search.
  - b. Early pull: "pulling the drawer open within ~1 s of the first map can lose the race with the footpath redraw, so the list cuts off and is asked for again". Option: load footpaths a little earlier, or hold the redraw while the drawer is open. Measure the first map and tap timings before and after.
  - c. Slow "Heute anders" right after the first map (from step 0.10.6, 2026-10-14): "opening 'Heute anders' from Mehr while the first map is still loading can take ~2 s (local and live); after that it opens in <0.1 s". Same busy moment as b; find what it waits for (the changes file, the worker or the footpath redraw) and let it open at once.
- **0.10.8 Start card lines overlap while footpaths load** (from step 0.10.6, 2026-10-14): "in one local test, while footpaths were loading, the 'Fußwege werden geladen…' line on the start card was drawn on top of 'Oder tippe irgendwo auf die Karte.' Not confirmed on the live site."
  - a. Try to reproduce at phone size 360×740, locally and on the live site, with a slow footpath load.
  - b. If it shows, give the loading line its own row so nothing overlaps; if it never shows, close the step with the screenshots.

## 0.11 Easier map reading

- **0.11.0 Darker time rings**. Ring labels already pass (10 : 1 or better everywhere), but the 60-min ring line (#d6c8f2) is only 1.4 : 1 against the map.
  - a. New ring colours 15 #1a0848, 30 #3b1d86, 45 #6440b4, 60 #7a58c4 (all 3 : 1 or better, water included).
  - b. Check whether the chip bar or the trip card hides rings.
  - c. Open question for Hendrik, asked with the screenshots: should 0–5 min stay the darkest green in the colour fill?

## 0.12 Treffpunkt mode

- **0.12.0 Treffpunkt looks, options only** (Hendrik, 2026-10-13 10:47: "Treffpunkt does not need to be there as a button on the home screen, when we are in Treffpunkt mode the 3. person button should be the same as in the connection drawer and we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build").
  - a. Five colour codings for the meeting map that show both total time and fairness (for example two-tone fills, hatching for unfair places, or a combined score scale).
  - b. Each shown as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and the "+ Person" button styled as in the trip drawer.
  - c. Nothing changes in the live app in this step.
- **0.12.1 Treffpunkt mode built**: the option Hendrik picks from 0.12.0 becomes the meeting map; the home-screen button goes and "+ Person" matches the drawer.

## 0.13 Faster and steadier routing

- **0.13.0 First map under 1.5 s on a fresh visit**. Done so far: the start page fetches the first timetable and the worker draws the first map ahead (#260, #261). Repeat visits open in about 0.75 s live; fresh visits measured 1.4–2.1 s.
  - a. Shrink or split the app bundle (MapLibre is about 320 KB gzipped) and the setup before the first map.
  - b. Check whether Safari downloads the first timetable twice when the page's and the worker's requests overlap.
- **0.13.1 Same trip whichever end is the anchor** (Hendrik, 2026-10-13 10:38, for later when optimising: "switching between anchor and pin causes recalculation and sometimes gives different routes depending on which one is anchor and pin while it should give the same since start and Ziel does not change").
  - a. Collect trip pairs that differ when anchor and pin swap.
  - b. Find why the forward and backward searches pick different trips (tie-breaks, transfer rules, time windows).
  - c. Fix so both give the same trip, with a test over the pairs from a.
- **0.13.2 Timetable windows check** (Hendrik, 2026-10-13 11:03: "check the timetables where day we might only need two hour windows for typical and best connection and for the "next" calculation, is a one hour window, however it is build right now a good way to go or can we optimise in terms of speed and accuracy?").
  - a. Measure today's windows: what each timetable file holds and how long each kind of map takes.
  - b. Try two-hour windows for Typisch and best connection and one hour for Nächste; compare speed, file size and trip accuracy against today.
  - c. Include the extra hour's edge (from the 0.10.2 thread, 2026-10-13: late in the extra hour after the chosen one, trips longer than about an hour can come out slightly worse, because an hour's file stops holding trips two hours after its own hour). Measure how often and by how much, and whether a longer tail fixes it at a fair file-size cost.
  - d. Hendrik gets the numbers and a recommendation; the change is built only on his yes.

## 0.14 Showcase refresh

Last, so the pictures show the finished looks.

- **0.14.0 New screenshots and sharepics**.
  - a. Retake the showcase screenshots (showcase/screens/) with the current default map.
  - b. Re-render the German sharepics if they show the default map.

## 1.0 Berlin app finished

- **1.0.0 Release**: every milestone above is live.
  - a. Final check at phone size 360×740 on the live site, with timings.
  - b. Version 1.0.0 and tag `v1.0.0`; a short "what's in 1.0" list in README.md.
  - c. Hendrik's projects overview row updated.

## Held

- **Other regions, Oldenburg / Weser-Ems first** (after 1.0): held until the domain and the timetable feed account are settled. Decided (Hendrik, 2026-10-12): one app, each region at its own address (`…/berlin/`, `…/oldenburg/`) with its own manifest, name and icon; one codebase and deploy with a data folder per region; favourites per region; own nightly build per region. Region-ready code is in `packages/routing/src/regions.ts` (#126). Details in archive/plan/regions.md.
- **Android and iOS app store deployment**: needs Hendrik's own developer accounts (Google Play one-time 25 USD with a two-week closed test, Apple 99 USD a year with review). Android would start as a TWA (archive/plan/android-notes.md), iOS needs a wrapper such as Capacitor.

## Not planned

- Android app and beta testing (Hendrik, 2026-10-13: "don't do android app and beta testing"). The beta plan is in archive/plan/beta-readiness.md.
- Fare zones on the map, sharing a picture of the map, "who can I reach" population figures, dark map and app shortcuts (Hendrik, 2026-10-12), kept in archive/plan/suggestions-2.md.

## Changelog

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
