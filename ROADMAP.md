# Roadmap V1.32

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.12.0**. Everything built so far, older changelog lines, held and not planned ideas are archived in archive/plan/ (project files), latest in roadmap-v1.21-full-2026-10-14.md.

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

Empty.

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
- **0.13.3 Changing direction keeps the departure time**. Hendrik (2026-10-14): "changing direction should not switch to Ankunftszeit mode". Today the trip card's ⇅, moving the map to the other end of the trip and the Zeit panel's Losfahren/Ankommen are one switch: when the map's place becomes the Ziel, the time turns into an arrival time ("Ankommen um …", and on "Jetzt" it even moves an hour on). So Start/Ziel and departure/arrival time are tied together.
  - a. Make them two separate choices: ⇅ and moving the map only change which place is Start and which is Ziel; the time stays a departure time ("Losfahren") unless Ankommen is picked in the Zeit panel.
  - b. A map to a Ziel with a departure time needs the trips from every place leaving at that time. Measure whether that is as fast as today's arrival map; if not, find a quick way (for example from the hour's timetable already loaded) and report the timings before building.
  - c. "Rückgängig" and links (dir=arr) keep working; the trip on the card stays the same when only the direction changes.
- **0.13.4 Timetable windows check**. Hendrik (2026-10-13): "check the timetables where day we might only need two hour windows for typical and best connection and for the "next" calculation, is a one hour window, however it is build right now a good way to go or can we optimise in terms of speed and accuracy?"
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

- **1.0.0 Release**: every milestone above is live (the optional design list below is not needed).
  - a. Final check at phone size 360×740 on the live site, with timings.
  - b. Version 1.0.0 and tag `v1.0.0`; a short "what's in 1.0" list in README.md.
  - c. Hendrik's projects overview row updated.

## Optional design decisions

Not needed for 1.0.0. Design ideas and add-ons Hendrik calls optional for now live in their own list, **OPTIONAL-DESIGN.md** (project copy plan/optional-design.md), with ids D1, D2 …. An item he picks moves back into a numbered milestone above and gets its version there.

## Changelog

Only the latest lines stay here; older ones are in the archived copies.

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
- **V1.21** (2026-10-14): the Inbox note from step 0.10.8 placed as new step 0.10.10 Footpath loading line on a slow download.
- **V1.20** (2026-10-14): 0.10.8 Start card lines overlap while footpaths load done (#295).
