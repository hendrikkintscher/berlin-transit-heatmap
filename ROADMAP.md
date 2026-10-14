# Roadmap V1.26

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.10.10**. Everything built so far, older changelog lines, held and not planned ideas are archived in archive/plan/ (project files), latest in roadmap-v1.21-full-2026-10-14.md.

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

- **0.10.11 "Heute anders" retries a failed changes download**. Noted after 0.10.9: if changes.json fails to load (for example offline at the moment of opening), the "Heute anders" entry stays hidden until the app is reopened, because nothing tries again.
  - a. When Mehr opens and the changes file is missing after a failed load, fetch it once more quietly in the background; on success the entry shows as usual.
  - b. No extra work on the first map or on taps: the retry runs only on a Mehr open and at most once per open.

## 0.11 Easier map reading

- **0.11.0 Darker time rings**. Ring labels already pass (10 : 1 or better everywhere), but the 60-min ring line (#d6c8f2) is only 1.4 : 1 against the map.
  - a. New ring colours 15 #1a0848, 30 #3b1d86, 45 #6440b4, 60 #7a58c4 (all 3 : 1 or better, water included).
  - b. Check whether the chip bar or the trip card hides rings.
  - c. Open question for Hendrik, asked with the screenshots: should 0–5 min stay the darkest green in the colour fill?

- **0.11.1 Status lines keep the map clear**. Noted after 0.10.10: while footpaths load, the status line covers the map strip between the tip card and the bottom buttons (y 661–680 at 360×740). Fine for its 5 s, but other status lines may stay longer.
  - a. List every status line, where it sits and how long it can stay.
  - b. Any that can stay over the map strip for more than about 5 s moves or shortens; the rest stay as they are.

## 0.12 Treffpunkt mode

- **0.12.0 Treffpunkt looks, options only**. Hendrik (2026-10-13): "Treffpunkt does not need to be there as a button on the home screen, when we are in Treffpunkt mode the 3. person button should be the same as in the connection drawer and we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build".
  - a. Five colour codings for the meeting map that show both total time and fairness (for example two-tone fills, hatching for unfair places, or a combined score scale).
  - b. Each shown as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and the "+ Person" button styled as in the trip drawer.
  - c. Nothing changes in the live app in this step.
- **0.12.1 Treffpunkt mode built**: the option Hendrik picks from 0.12.0 becomes the meeting map; the home-screen button goes and "+ Person" matches the drawer.
- **0.12.2 Closing Treffpunkt keeps the second place**. Hendrik (2026-10-14): "after closing Treffpunkt mode the second location should be retained". Today the banner's ✕ drops every start but the first, so the second place is lost.
  - a. On close, the second place stays on the map as the trip's other end (the pin), so the card shows the trip between the two places.
  - b. Opening Treffpunkt again, or "+ Person", brings it back as the second person.
- **0.12.3 Treffpunkt opens in its own map look**. Hendrik (2026-10-14): "when Treffpunkt mode is started change map style to it's specific heatmap mode". Today the meeting map keeps whatever look was on (rings or the Heatmap switch).
  - a. Starting Treffpunkt switches the map to the meeting colouring built in 0.12.1 (time and fairness); closing it returns to the look that was on before.
  - b. One repaint, no extra routing on the switch.

## 0.13 Faster and steadier routing

- **0.13.0 First map under 1.5 s on a fresh visit**. The start page already fetches the first timetable and the worker draws the first map ahead. Repeat visits open in about 0.75 s live; fresh visits measured 1.4–2.1 s.
  - a. Shrink or split the app bundle (MapLibre is about 320 KB gzipped) and the setup before the first map.
  - b. Check whether Safari downloads the first timetable twice when the page's and the worker's requests overlap.
  - c. Tap delay while the first maps draw: in the headless browser, map frames take 250–400 ms each for the first ~7 s. Measure tap-to-trip time in those first seconds at phone size with a slowed CPU, and ask Hendrik for one real-phone check; if busy frames delay taps, spread or defer that work.
- **0.13.1 Footpaths start downloading sooner**. Noted after 0.10.10: the footpath download starts about 3–5 s after the first map because it waits for the base map to finish; on a slow line that pushes the more exact times back further.
  - a. Measure when the footpaths start and arrive today, on a normal and a slowed line.
  - b. Start the download earlier (for example once the first map is drawn, not when the base map is idle), as long as it does not slow the first map or taps.
- **0.13.2 Same trip whichever end is the anchor**. Hendrik (2026-10-13): "switching between anchor and pin causes recalculation and sometimes gives different routes depending on which one is anchor and pin while it should give the same since start and Ziel does not change".
  - a. Collect trip pairs that differ when anchor and pin swap.
  - b. Find why the forward and backward searches pick different trips (tie-breaks, transfer rules, time windows).
  - c. Fix so both give the same trip, with a test over the pairs from a.
- **0.13.3 Timetable windows check**. Hendrik (2026-10-13): "check the timetables where day we might only need two hour windows for typical and best connection and for the "next" calculation, is a one hour window, however it is build right now a good way to go or can we optimise in terms of speed and accuracy?"
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

- **V1.26** (2026-10-14): two Inbox notes from 0.10.10 placed as 0.11.1 Status lines keep the map clear and 0.13.1 Footpaths start downloading sooner (old 0.13.1–0.13.2 now 0.13.2–0.13.3); Hendrik's two Treffpunkt wishes placed as 0.12.2 Closing Treffpunkt keeps the second place and 0.12.3 Treffpunkt opens in its own map look. Next in order: 0.10.11 "Heute anders" retries a failed changes download.
- **V1.25** (2026-10-14): 0.10.10 Footpath loading line on a slow download done (#302): the line shows for 5 s at most, the thin bar keeps the download's progress, and when the footpaths arrive later the redone map brings a short note ("Fußwege geladen, die Zeiten sind jetzt genauer."). Measured at 150 KB/s: line 23 s → 5 s; a fast download looks as before. Next in order: 0.10.11 "Heute anders" retries a failed changes download.
- **V1.24** (2026-10-14): the Inbox note from step 0.10.9 placed as new step 0.10.11 "Heute anders" retries a failed changes download. Next in order: 0.10.10 Footpath loading line on a slow download.
- **V1.23** (2026-10-14): 0.10.9 "Heute anders" entry in Mehr from the start done (#299): the entry is there as soon as Mehr opens; before the changes file is in, a tap opens the box with a loading line that fills when the file arrives, or says all runs as usual. Next in order: 0.10.10 Footpath loading line on a slow download.
- **V1.22** (2026-10-14): roadmap made lean (Hendrik: "only how to use it and detailed enough explanations for the steps"). Moved to archive/plan/roadmap-v1.21-full-2026-10-14.md: past versions table, changelog V1.0–V1.20, Held and Not planned, provenance notes. No step changed. Next in order: 0.10.9 "Heute anders" entry in Mehr from the start.
- **V1.21** (2026-10-14): the Inbox note from step 0.10.8 placed as new step 0.10.10 Footpath loading line on a slow download.
- **V1.20** (2026-10-14): 0.10.8 Start card lines overlap while footpaths load done (#295).
