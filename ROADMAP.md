# Roadmap V1.2

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.9.0** (through PR #272). Everything built so far is archived in archive/plan/roadmap-done-2026-10-13.md (project files); the roadmap before V1 is in archive/plan/roadmap-v0-2026-10-13.md.

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
| 0.9.0   | 10-13 now | App shows its version in the Mehr menu; git tag per step                                        | #272      |

## Inbox

Hendrik's wishes given without a pick land here: one dated line each, in his words. They are moved to their milestone in the next roadmap version.

_Empty._

## 0.9 App version (follow-ups)

Two notes from step 0.9.0, placed first because every later step ships a version and a tag.

- **0.9.1 Automatic tag per version** (from step 0.9.0, 2026-10-13 12:47: "threads cannot push git tags, so tagging every step needs Hendrik by hand; idea: a small workflow that tags each merge to main whenever the version in package.json changes").
  - a. A GitHub Actions workflow on push to main reads the version in package.json and creates the tag `vX.Y.Z` when it does not exist yet.
  - b. Nothing happens when the version is unchanged; the deploy is not slowed.
  - c. Hendrik's manual tagging step is dropped from the step routine.
- **0.9.2 Version line in German and English** (from step 0.9.0, 2026-10-13 12:47: "the version line is the same in German and English; the short commit shows only as a tooltip, which can't be seen on a phone").
  - a. The version line in Mehr gets German and English wording.
  - b. The short commit is shown in visible text instead of only as a tooltip.

## 0.10 Trip card and changes

- **0.10.0 Later connections while pulling** (Hendrik, 2026-10-13 11:03: "The drawer shows later connections only when already pulled out, not while pulling. Those should also take connections in the next hour into account.").
  - a. The later connections are filled in as soon as the pull starts, so they slide up with the drawer.
  - b. They reach into the next hour (the next hour's timetable, loaded in the background), not only the current one.
  - c. Timings: the pull stays smooth on a phone.
- **0.10.1 "Heute anders" into Mehr** (Hendrik, 2026-10-13 07:36: "Heute Anders never as popup, only in the mehr Menu, there should open a box with all the info when tapped. For the map and connection view the information is already displayed when a connection has Änderungen, when those appear, make them clickable and open a popup with the relevant information. Same as now clicking the heute now popup does"). Code: changes.ts, the #changes chip and panel in index.html, noteFor() for the trip card.
  - a. The chip and its popup go.
  - b. Mehr gets a "Heute anders" entry that opens the full list.
  - c. Change notes on the trip card become tappable and open the same details for that line.

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
  - c. Hendrik gets the numbers and a recommendation; the change is built only on his yes.

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

- **V1.2** (2026-10-13): the two Inbox notes from step 0.9.0 placed as 0.9.1 Automatic tag per version and 0.9.2 Version line in German and English; milestone 0.9 reopened for them, next in order.
- **V1.1** (2026-10-13): 0.9.0 App shows its version done (#272, tag `v0.9.0`); milestone 0.9 closed. From here every step's PR bumps the version in package.json and tags its merge.
- **V1.0** (2026-10-13): versioning introduced for the app and the roadmap; milestones renamed to app versions 0.9–1.0 with steps and substeps; the four Inbox notes of 2026-10-13 placed (0.10.0, 0.12, 0.13.1, 0.13.2); Clear trips (old milestone 1) done as 0.8.0.
