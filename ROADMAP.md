# Roadmap V1.48

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.13.7**. Two companion docs: [CHANGELOG.md](CHANGELOG.md) (project copy plan/changelog.md) records everything built and every roadmap version; [LATER.md](LATER.md) (plan/later.md) holds what is planned for much later and not scheduled yet, plus what is set aside or not planned. Older write-ups are archived in archive/plan/ (project files).

## How to use this roadmap

- **Hendrik picks each step.** One thread builds that one step (PR, CI green, merge), reports, and stops. The order below is a proposal; nothing is built without his pick.
- **Snappiness is the USP.** No step may slow taps, panning or the first map; anything heavy is precomputed, loaded in the background or optional. Every step checks at phone size 360×740 and reports its timings.
- **Inbox.** Hendrik's wishes given without a pick land in the Inbox below, one dated line each in his words. The next roadmap edit moves each to its milestone and empties the Inbox.
- **Finished steps** are removed from the roadmap; their line in CHANGELOG.md records them.
- **Later.** Wishes for much later, not yet scheduled, go to LATER.md instead of a milestone; an item moves from there to the roadmap only when Hendrik says so.

### Versioning

- **App**: `0.MINOR.PATCH` until the Berlin app is finished at **1.0.0**. A milestone is one minor version (0.10, 0.11 …). A step is one PR shipping as the next patch (`0.N.0`, `0.N.1` …), and that version is its id. Substeps `a`, `b`, `c` ship in the step's PR. Bug fixes between steps bump the live milestone's patch. Versions of unbuilt steps are guesses and get renumbered if the order changes.
- Every step bumps the version in **both** package.json files (root and packages/web). The workflow "Tag version" tags the merge `vX.Y.Z` automatically; nobody tags by hand.
- **Roadmap**: `V1.x`. Every edit that adds, removes, reorders or finishes a step bumps x and adds a line at the top of "Roadmap versions" in CHANGELOG.md; a full reorganisation makes `V2.0`. ROADMAP.md, CHANGELOG.md and LATER.md stay identical to their project copies plan/roadmap.md, plan/changelog.md and plan/later.md (docs-only PR, `npx prettier --write` on the changed files).

## Inbox

(empty)

## 0.13 Faster and steadier routing

- **0.13.8 Footpaths on the map a second sooner**. Side note from 0.13.2 (2026-10-14): "Handing footpaths to the map right after unpacking would make them ready ~1 s sooner again (2.8 s), but redoing the map with them then delayed base map labels by ~1 s, so it wasn't kept. A cheaper map redo would unlock that second." Plan from the 0.13.2 thread; expected gain about 1 s (footpaths ready around 2.8 s instead of 3.76 s at 360×740).
  - a. Measure which part of the map redo costs the base map time: the new colours (one picture), the time rings, or the line courses with their name labels. Same 360×740 setup as 0.13.2.
  - b. Hand the footpaths over right after unpacking: put the new colours on the map at once; send rings, line courses and labels only once the base map is up, and skip them when they did not change. If a shows the rings are cheap, they go with the colours, so colours and rings never disagree.
  - c. Keep it only if the base map stays within noise and taps stay as fast; otherwise drop it and report the numbers.
  - d. Inbox note from 0.13.4 (2026-10-15): moving the map to the other end of a trip before the footpaths load keeps a trip found with straight-line walks; once the footpaths arrive it may not fit, and the card falls back to the usual trip. Ask for the kept trip again with the footpaths (its span a little wider), so the card keeps it.

- **0.13.9 Map walk rule: fastest, even with a longer walk (decision)**. From 0.13.4 (2026-10-15, Hendrik's call): "should the map use the "fastest, even with a longer walk" rule like the trip on tap? Brings them closer but changes the map at the edges of town (ties in with #237)." Today the map uses its 15-minute walk rule and #237's less walking on equal arrival, so map minutes and the tapped trip are 3 or more minutes apart in 8 % of places (0.13.4 check over 386 places).
  - a. Measure, with the same 386 places, how often map and trip agree under the "fastest, even with a longer walk" rule, and where the map changes (edges of town, long walks to a faster line), with before/after screenshots at 360×740.
  - b. Measure first map and tap timings with the new rule; it must not slow either.
  - c. Hendrik gets the numbers and a recommendation; the map changes only on his yes.

- **0.13.10 Ankommen under Typisch and Bestfall: trip and map agree**. Inbox note from 0.13.4 (2026-10-15): with Ankommen under Typisch or Bestfall, a tapped place's trip arrives by the start of the hour, but the map counts arrivals within that hour ("Ankunft 10 bis 11 Uhr"), so the two can be about an hour apart.
  - a. Count how often and by how much card and map differ today (random places, a few hours).
  - b. Let the trip on tap arrive within the hour the map counts (for example by its end, or the one closest to the map's minutes), so card and map tell the same; tap timings stay as they are.

- **0.13.11 Map to a Ziel with a departure time: follow-ups**. Inbox notes from 0.13.5 (2026-10-15) on the map built there (⇅ or the rings with Losfahren).
  - a. A tap on that map runs three searches for its trip (about 11 ms more than the arrival map's one in Node); keep the Ziel's walks to the stops per map, and measure the tap before and after.
  - b. Its lines follow a pass arriving 40 minutes after leaving, not the departure trips themselves; fine for the picture, not exact. Draw them from the trips the map's cells take, if that costs no more than today.
  - c. Its minutes are 3 or more apart from the tapped trip for 10–17 % of places (a vehicle caught or missed by seconds; the arrival map: 8 %). Two stop guesses per cell instead of one would halve that for about +100 ms per map; Hendrik decides with the numbers.

- **0.13.12 Stop list loaded once**. Inbox note from 0.13.6 (2026-10-15): most of every hourly timetable file is the stop list, the same in each: a night file with about 1,000 trips is 258 KB gzipped against 289–303 KB for 7,000–16,000 trips by day.
  - a. Split the stop list out of the hourly files into one file loaded once and kept by the service worker; each hourly file then holds only its trips.
  - b. Measure the first map on a fresh visit (one more file, so it must not get slower), a further hour's file, the next-hour preload and Vergleich, before and after, at 360×740.
  - c. Keep it only if the first map stays within noise; the speed budget's file-size check follows the new files.

- **0.13.13 Rolling on further and past midnight**. Inbox note from 0.13.6 (2026-10-15): a missed connection still rolls on only until two hours after the chosen hour (rollsOn), although the next hour's file it now uses holds trips further on; after 23 Uhr it stays on the chosen file (the next day's 0 Uhr is not used).
  - a. Let the card and the drawer roll on as far as the next hour's file reaches.
  - b. After 23 Uhr use the next day's 0 Uhr file (the coming week's date, or the right typical day), preloaded like the next hour's.
  - c. Tap timings stay as they are; check a few late-evening trips at 360×740.

## 0.14 Map handling

- **0.14.0 Long press moves the anchor**. Hendrik (2026-10-14): "long press moves the anchor point to the chosen location". Today the first map touch sets the anchor and every other tap moves the pin; moving the anchor needs the grey rings button on the trip card.
  - a. A long press on the map (about 0.5 s, finger held still) moves the anchor there, keeping its role (Start or Ziel), with one compute, the same path as the rings button; before any anchor exists it sets the first one, like the first tap. The pin and its trip card stay where they are, so the card then shows the trip from the new anchor.
  - b. "Rückgängig" (5 s) brings the old anchor back, as for the rings button; links update as usual.
  - c. A short tap, panning and pinch zoom work exactly as before; a long press on a start marker still shows its name. On a computer, a right-click does the same as a long press.
  - d. Check at phone size 360×740 that a normal tap is not delayed by the long-press wait.

## 0.15 Design decisions

Hendrik (2026-10-14) put the optional design list back on the roadmap before 1.0. Each item keeps its D id from that list (archived in archive/plan/optional-design-v1.2-2026-10-14.md). The order is a proposal: small fixes first, then the first visit, the Treffpunkt package (D9 → D10 → D11), then add-ons.

- **0.15.0 A little more room at the screen edges**. Hendrik (2026-10-14): "UI elements are now very close to the left and right edges of the display, give them a tiny bit more room".
  - a. List the elements that touch or nearly touch the left and right edges at 360×740 (search bar, chip row ends, trip card, legend, buttons) and their gap today.
  - b. Give them one shared side gap a few pixels wider (for example 8 → 12 px), respecting the phone's safe areas; the map itself stays edge to edge.
  - c. Screenshots before and after at 360×740 for Hendrik; no element wraps onto a new line.
- **0.15.1 Status lines keep the map clear** (D8). Noted after 0.10.10: while footpaths load, the status line covers the map strip between the tip card and the bottom buttons (y 661–680 at 360×740). Fine for its 5 s, but other status lines may stay longer.
  - a. List every status line, where it sits and how long it can stay.
  - b. Any that can stay over the map strip for more than about 5 s moves or shortens; the rest stay as they are.
- **0.15.2 Ring widths show their order** (D7). Noted after 0.11.0: the rings now come in look-alike pairs (15/30 near-black, 45/60 mid-purple), told apart mostly by their labels; a different line width per ring could restore the order at a glance.
- **0.15.3 Colour fill on for first-time visitors** (D2). Trial the colour fill on by default for first-time visitors (same repaint path, no extra routing).
- **0.15.4 Example map on the first screen** (D1). The first screen shows a finished, coloured example map (for example from Alexanderplatz) before any tap.
- **0.15.5 Question entries on the start screen** (D3). Besides "Von meinem Standort", the start screen offers 2–3 question entries: "Wo treffen wir uns?", "Was erreiche ich in 30 Min.?", "Wo soll ich wohnen?".
- **0.15.6 Treffpunkt looks, options only** (D9). Hendrik (2026-10-13): "Treffpunkt does not need to be there as a button on the home screen, when we are in Treffpunkt mode the 3. person button should be the same as in the connection drawer and we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build".
  - a. Five colour codings for the meeting map that show both total time and fairness (for example two-tone fills, hatching for unfair places, or a combined score scale).
  - b. Each shown as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and the "+ Person" button styled as in the trip drawer.
  - c. Nothing changes in the live app in this step.
- **0.15.7 Treffpunkt mode built** (D10): the option Hendrik picks from 0.15.6 becomes the meeting map; the home-screen button goes and "+ Person" matches the drawer.
  - c. Side note from step 0.12.0 (2026-10-14): today the floating Treffpunkt button brings back the closed person even after other places are tapped, until all starts are cleared; to add someone new instead, you tap "+ Person" once the first person is back. When the button goes, make sure there is still a direct way to start a meeting with someone new.
- **0.15.8 Treffpunkt opens in its own map look** (D11). Hendrik (2026-10-14): "when Treffpunkt mode is started change map style to it's specific heatmap mode". Today the meeting map keeps whatever look was on (rings or the Heatmap switch).
  - a. Starting Treffpunkt switches the map to the meeting colouring built in 0.15.7 (time and fairness); closing it returns to the look that was on before.
  - b. One repaint, no extra routing on the switch.
- **0.15.9 Places layer** (D4). Lakes, pools, parks and similar places shown with their minutes, answering "Wohin jetzt?".
- **0.15.10 Two start points side by side** (D5). Compare the maps of two start points (flat hunting).
- **0.15.11 Layout check on devices and browsers**. Hendrik (2026-10-14): "add making a layout and UI consistency check on different devices and browsers to the roadmap". Last in the milestone, so it checks the finished looks.
  - a. Screenshots of the main screens (first screen, map with rings, trip card and drawer, Zeit panel, search, Treffpunkt) on small and large phones (for example 360×740, 390×844, 430×932), a tablet and a desktop window, in Chrome, Safari (WebKit) and Firefox, in German and English.
  - b. List what differs or breaks (overlaps, cut-off text, wrong gaps, safe areas, fonts, touch targets under 44 px) and fix the small ones in this step; anything bigger goes to the Inbox.
  - c. Timings on each browser stay as before; the screenshots go to the project files for Hendrik.

## 0.16 Showcase refresh

Last, so the pictures show the finished looks.

- **0.16.0 New screenshots and sharepics**.
  - a. Retake the showcase screenshots (showcase/screens/) with the current default map.
  - b. Re-render the German sharepics if they show the default map.
- **0.16.1 Sharepic per use case** (D6). One picture per question ("one picture, one question") instead of one feature list.

## 1.0 Berlin app finished

- **1.0.0 Release**: every milestone above is live.
  - a. Final check at phone size 360×740 on the live site, with timings.
  - b. Version 1.0.0 and tag `v1.0.0`; a short "what's in 1.0" list in README.md.
  - c. Hendrik's projects overview row updated.
