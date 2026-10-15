# Roadmap V1.43

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.13.3**. Two companion docs: [CHANGELOG.md](CHANGELOG.md) (project copy plan/changelog.md) records everything built and every roadmap version; [LATER.md](LATER.md) (plan/later.md) holds what is planned for much later and not scheduled yet, plus what is set aside or not planned. Older write-ups are archived in archive/plan/ (project files).

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

## 0.13 Faster and steadier routing

- **0.13.4 Changing direction keeps the departure time**. Hendrik (2026-10-14): "changing direction should not switch to Ankunftszeit mode". Today the trip card's ⇅, moving the map to the other end of the trip and the Zeit panel's Losfahren/Ankommen are one switch: when the map's place becomes the Ziel, the time turns into an arrival time ("Ankommen um …", and on "Jetzt" it even moves an hour on). So Start/Ziel and departure/arrival time are tied together.
  - a. Make them two separate choices: ⇅ and moving the map only change which place is Start and which is Ziel; the time stays a departure time ("Losfahren") unless Ankommen is picked in the Zeit panel.
  - b. A map to a Ziel with a departure time needs the trips from every place leaving at that time. Measure whether that is as fast as today's arrival map; if not, find a quick way (for example from the hour's timetable already loaded) and report the timings before building.
  - c. "Rückgängig" and links (dir=arr) keep working; the trip on the card stays the same when only the direction changes.
- **0.13.5 Timetable windows check**. Hendrik (2026-10-13): "check the timetables where day we might only need two hour windows for typical and best connection and for the "next" calculation, is a one hour window, however it is build right now a good way to go or can we optimise in terms of speed and accuracy?"
  - a. Measure today's windows: what each timetable file holds and how long each kind of map takes.
  - b. Try two-hour windows for Typisch and best connection and one hour for Nächste; compare speed, file size and trip accuracy against today.
  - c. Include the extra hour's edge: late in the extra hour after the chosen one, trips longer than about an hour can come out slightly worse, because an hour's file stops holding trips two hours after its own hour. Measure how often and by how much, and whether a longer tail fixes it at a fair file-size cost.
  - d. Hendrik gets the numbers and a recommendation; the change is built only on his yes.

- **0.13.6 Fresh-start link**. Hendrik (2026-10-14): "add a link option like [URL]/fresh to start from a fresh, non-cached start like from a new device".
  - a. Opening the app's address with `/fresh` (GitHub Pages serves only files, so a small page at fresh/ or a `?fresh` link) removes the app's service worker, its caches and stored data, then opens the app as on a new device.
  - b. Favourites and names live only on the device, so the page says they will go and asks once before deleting them (or offers to keep them); nothing is deleted without that tap.
  - c. The normal address loads exactly as before; the fresh page adds nothing to the first map.

- **0.13.7 Footpaths on the map a second sooner**. Side note from 0.13.2 (2026-10-14): "Handing footpaths to the map right after unpacking would make them ready ~1 s sooner again (2.8 s), but redoing the map with them then delayed base map labels by ~1 s, so it wasn't kept. A cheaper map redo would unlock that second." Plan from the 0.13.2 thread; expected gain about 1 s (footpaths ready around 2.8 s instead of 3.76 s at 360×740).
  - a. Measure which part of the map redo costs the base map time: the new colours (one picture), the time rings, or the line courses with their name labels. Same 360×740 setup as 0.13.2.
  - b. Hand the footpaths over right after unpacking: put the new colours on the map at once; send rings, line courses and labels only once the base map is up, and skip them when they did not change. If a shows the rings are cheap, they go with the colours, so colours and rings never disagree.
  - c. Keep it only if the base map stays within noise and taps stay as fast; otherwise drop it and report the numbers.

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
