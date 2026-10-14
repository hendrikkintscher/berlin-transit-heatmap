# Roadmap V1.23

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.10.9**. Everything built so far, older changelog lines, held and not planned ideas are archived in archive/plan/ (project files), latest in roadmap-v1.21-full-2026-10-14.md.

## How to use this roadmap

- **Hendrik picks each step.** One thread builds that one step (PR, CI green, merge), reports, and stops. The order below is a proposal; nothing is built without his pick.
- **Snappiness is the USP.** No step may slow taps, panning or the first map; anything heavy is precomputed, loaded in the background or optional. Every step checks at phone size 360×740 and reports its timings.
- **Inbox.** Hendrik's wishes given without a pick land in the Inbox below, one dated line each in his words. The next roadmap edit moves each to its milestone and empties the Inbox.
- **Finished steps** are removed from the roadmap; the changelog line records them.

### Versioning

- **App**: `0.MINOR.PATCH` until the Berlin app is finished at **1.0.0**. A milestone is one minor version (0.10, 0.11 …). A step is one PR shipping as the next patch (`0.N.0`, `0.N.1` …), and that version is its id. Substeps `a`, `b`, `c` ship in the step's PR. Bug fixes between steps bump the live milestone's patch. Versions of unbuilt steps are guesses and get renumbered if the order changes.
- Every step bumps the version in **both** package.json files (root and packages/web). The workflow "Tag version" tags the merge `vX.Y.Z` automatically; nobody tags by hand.
- **Roadmap**: `V1.x`. Every edit that adds, removes, reorders or finishes a step bumps x and adds a changelog line at the bottom; a full reorganisation makes `V2.0`. ROADMAP.md and the project copy plan/roadmap.md stay identical (docs-only PR, `npx prettier --write ROADMAP.md`).

## Inbox

## 0.10 Trip drawer and changes, follow-ups

- **0.10.10 Footpath loading line on a slow download**. On the live site the "Fußwege werden geladen…" line shows only briefly (~4–5 s after a fresh open), but with a slow footpath download it stays up until the download finishes.
  - a. Measure at phone size with a slowed footpath file how long the line stays and what it covers.
  - b. Make a long wait calmer: for example show progress, or let the line go after a few seconds since the map already works without footpaths, and bring a short note back when they arrive. Keep the fast case as it is.

## 0.11 Easier map reading

- **0.11.0 Darker time rings**. Ring labels already pass (10 : 1 or better everywhere), but the 60-min ring line (#d6c8f2) is only 1.4 : 1 against the map.
  - a. New ring colours 15 #1a0848, 30 #3b1d86, 45 #6440b4, 60 #7a58c4 (all 3 : 1 or better, water included).
  - b. Check whether the chip bar or the trip card hides rings.
  - c. Open question for Hendrik, asked with the screenshots: should 0–5 min stay the darkest green in the colour fill?

## 0.12 Treffpunkt mode

- **0.12.0 Treffpunkt looks, options only**. Hendrik (2026-10-13): "Treffpunkt does not need to be there as a button on the home screen, when we are in Treffpunkt mode the 3. person button should be the same as in the connection drawer and we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build".
  - a. Five colour codings for the meeting map that show both total time and fairness (for example two-tone fills, hatching for unfair places, or a combined score scale).
  - b. Each shown as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and the "+ Person" button styled as in the trip drawer.
  - c. Nothing changes in the live app in this step.
- **0.12.1 Treffpunkt mode built**: the option Hendrik picks from 0.12.0 becomes the meeting map; the home-screen button goes and "+ Person" matches the drawer.

## 0.13 Faster and steadier routing

- **0.13.0 First map under 1.5 s on a fresh visit**. The start page already fetches the first timetable and the worker draws the first map ahead. Repeat visits open in about 0.75 s live; fresh visits measured 1.4–2.1 s.
  - a. Shrink or split the app bundle (MapLibre is about 320 KB gzipped) and the setup before the first map.
  - b. Check whether Safari downloads the first timetable twice when the page's and the worker's requests overlap.
  - c. Tap delay while the first maps draw: in the headless browser, map frames take 250–400 ms each for the first ~7 s. Measure tap-to-trip time in those first seconds at phone size with a slowed CPU, and ask Hendrik for one real-phone check; if busy frames delay taps, spread or defer that work.
- **0.13.1 Same trip whichever end is the anchor**. Hendrik (2026-10-13): "switching between anchor and pin causes recalculation and sometimes gives different routes depending on which one is anchor and pin while it should give the same since start and Ziel does not change".
  - a. Collect trip pairs that differ when anchor and pin swap.
  - b. Find why the forward and backward searches pick different trips (tie-breaks, transfer rules, time windows).
  - c. Fix so both give the same trip, with a test over the pairs from a.
- **0.13.2 Timetable windows check**. Hendrik (2026-10-13): "check the timetables where day we might only need two hour windows for typical and best connection and for the "next" calculation, is a one hour window, however it is build right now a good way to go or can we optimise in terms of speed and accuracy?"
  - a. Measure today's windows: what each timetable file holds and how long each kind of map takes.
  - b. Try two-hour windows for Typisch and best connection and one hour for Nächste; compare speed, file size and trip accuracy against today.
  - c. Include the extra hour's edge: late in the extra hour after the chosen one, trips longer than about an hour can come out slightly worse, because an hour's file stops holding trips two hours after its own hour. Measure how often and by how much, and whether a longer tail fixes it at a fair file-size cost.
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

## Changelog

Only the latest lines stay here; older ones are in the archived copies.

- **V1.23** (2026-10-14): 0.10.9 "Heute anders" entry in Mehr from the start done (#299): the entry is there as soon as Mehr opens; before the changes file is in, a tap opens the box with a loading line that fills when the file arrives, or says all runs as usual. Next in order: 0.10.10 Footpath loading line on a slow download.
- **V1.22** (2026-10-14): roadmap made lean (Hendrik: "only how to use it and detailed enough explanations for the steps"). Moved to archive/plan/roadmap-v1.21-full-2026-10-14.md: past versions table, changelog V1.0–V1.20, Held and Not planned, provenance notes. No step changed. Next in order: 0.10.9 "Heute anders" entry in Mehr from the start.
- **V1.21** (2026-10-14): the Inbox note from step 0.10.8 placed as new step 0.10.10 Footpath loading line on a slow download.
- **V1.20** (2026-10-14): 0.10.8 Start card lines overlap while footpaths load done (#295).
