# Roadmap V2.1

Live at https://hendrikkintscher.github.io/berlin-transit-heatmap/ as app **0.13.12**. Two companion docs: [CHANGELOG.md](CHANGELOG.md) (project copy plan/changelog.md) records everything built and every roadmap version; [LATER.md](LATER.md) (plan/later.md) holds what is planned for much later and not scheduled yet, plus what is set aside or not planned. Older write-ups are archived in archive/plan/ (project files).

## North star

**A map you can trust, faster than you can ask the next question.** Every step is judged first by the timings at phone size 360×740 (also with the page CPU slowed 4×): the first map on a fresh visit (worker `result` message), a tap to its trip on the card, ⇅, and moving the rings. A step that slows any of them does not ship. The second measure is agreement: the trip on tap and the map's minutes should tell the same story.

## Now, next, later

| When  | Theme (outcome)                                 | Steps                                    |
| ----- | ----------------------------------------------- | ---------------------------------------- |
| Now   | A. Trip and map agree (0.13)                    | 0.13.14, 0.13.15, 0.13.17–18             |
| Now   | B. Fast and steady loading and measuring (0.13) | 0.13.13, 0.13.16                         |
| Next  | C. Map handling (0.14)                          | 0.14.0                                   |
| Next  | D. Clear and welcoming looks (0.15)             | 0.15.0–0.15.5, 0.15.11                   |
| Next  | E. Treffpunkt that shows fairness (0.15)        | 0.15.6 → 0.15.7 → 0.15.8                 |
| Next  | F. New questions to ask (0.15)                  | 0.15.9, 0.15.10                          |
| Later | G. Showcase and release (0.16, 1.0)             | 0.16.0, 0.16.1, 1.0.0                    |
| Later | Beyond 1.0                                      | [LATER.md](LATER.md): desktop, regions … |

"Now" is the live milestone, "Next" the milestones before 1.0, "Later" the release and what follows. There are no dates: the order is a proposal and Hendrik picks.

## How to use this roadmap

- **Hendrik picks each step.** One thread builds that one step (PR, CI green, merge), reports, and stops. Nothing is built without his pick.
- **Snappiness is the USP.** No step may slow taps, panning or the first map; anything heavy is precomputed, loaded in the background or optional. Every step checks at phone size 360×740 and reports its timings (method in CLAUDE.md).
- **Step format.** Each step is one node: **id and title**, its labels, one line on why (with the source: Hendrik's words or the note that raised it), the evidence (bench, PR), what "done" means, and substeps a, b, c that ship in the step's PR.
- **Labels.** Priority: **must** (needed for 1.0, or keeps the north star), **should** (planned before 1.0), **could** (before 1.0 if time allows; may move to LATER.md). Kind: **build** (ships code), **decision** (measure, report a short table and a recommendation, and wait for Hendrik's yes before building), **check** (look and report; small fixes only).
- **Inbox.** Hendrik's wishes given without a pick, and things noticed while building, land in the Inbox at the end, one dated line each ("2026-10-16 (from 0.13.9): …"). The next roadmap edit turns each into a step node in its theme and empties the Inbox.
- **Finished steps** leave the roadmap; their row and line in CHANGELOG.md record them. Nothing done stays here.
- **Later.** Wishes for much later, not yet scheduled, go to LATER.md; an item moves from there to the roadmap only when Hendrik says so.
- The structure (north star, outcome themes, now/next/later, priority labels, nodes with resources) follows the product-manager roadmap of [roadmap.sh](https://roadmap.sh/product-manager) (source: nilbuild/developer-roadmap): outcome-based and continuous roadmapping, prioritisation with MoSCoW-style labels.

### Versioning

- **App**: `0.MINOR.PATCH` until the Berlin app is finished at **1.0.0**. A milestone is one minor version (0.13, 0.14 …). A step is one PR shipping as the next patch, and that version is its id. Bug fixes between steps bump the live milestone's patch. Versions of unbuilt steps are guesses and get renumbered if the order changes.
- Every step bumps the version in **both** package.json files (root and packages/web). The workflow "Tag version" tags the merge `vX.Y.Z` automatically; nobody tags by hand.
- **Roadmap**: `V2.x`. Every edit that adds, removes, reorders or finishes a step bumps x and adds a line at the top of "Roadmap versions" in CHANGELOG.md; a full reorganisation makes the next major (`V3.0`). ROADMAP.md, CHANGELOG.md and LATER.md stay identical to their project copies plan/roadmap.md, plan/changelog.md and plan/later.md (docs-only PR, `npx prettier --write` on the changed files).

## Now: A. Trip and map agree

Outcome: the trip on tap and the map's minutes match, in every mode and at every hour.

- **0.13.14 Rolling on further and past midnight** · should · build
  - Why: note from 0.13.6 (2026-10-15): a missed connection still rolls on only until two hours after the chosen hour (rollsOn), although the next hour's file it now uses holds trips further on; after 23 Uhr it stays on the chosen file (the next day's 0 Uhr is not used).
  - Done when: late-evening trips roll on into the next day, with tap timings unchanged.
  - a. Let the card and the drawer roll on as far as the next hour's file reaches.
  - b. After 23 Uhr use the next day's 0 Uhr file (the coming week's date, or the right typical day), preloaded like the next hour's.
  - c. Tap timings stay as they are; check a few late-evening trips at 360×740.

- **0.13.15 A trip kept before the footpaths: hold the move?** · could · decision
  - Why: note from 0.13.8 (2026-10-16): a trip kept by moving the map to its other end before the footpaths are in now stays on the card in 7 of 9 checked moves. Evidence: `bench/kept.ts` over 296 random trips: same rides in 38 %, 43 % counting the usual trip where none fits, against 24 % before; in the rest the footpath walks at the ends miss the kept vehicles. Asking by the rides themselves (first departure less the new walk, last arrival plus it) measured no better (38 %).
  - a. Measure how long a move before the footpaths would wait if it were held until they are in (fresh visits at 360×740, also with the page CPU slowed 4×), and how often a move comes that early.
  - b. Hendrik gets the numbers and a recommendation: hold the move (the trip kept every time, an early move slower) or leave it as it is; nothing changes without his yes.

- **0.13.17 Long walks shown on the card** · should · build
  - Why: note from 0.13.9 (2026-10-16): trips on tap may now walk up to 30 minutes at an end when that is faster (58 of 390 checked trips, 11 minutes earlier in the median; `bench/walkrule.ts`, #333); the card shows the walk's minutes but says nothing about it being long.
  - Done when: a long walk is visible at a glance, with tap timings unchanged.
  - a. A short hint on the card ("langer Fußweg") when a walk at either end is longer than 15 minutes.
  - b. Optionally the slower trip with less walking in the drawer, if it comes from the same search; otherwise report the cost and leave it out.
  - c. Check at 360×740 that the hint fits without wrapping, in German and English.

- **0.13.18 Ankommen under Bestfall: closer to the map?** · could · decision
  - Why: note from 0.13.11 (2026-10-16): under Bestfall with Ankommen the trip on tap (the last connection of the hour) is 3 or more minutes off the map in 53 % of places (Typisch differs by design: the map counts waiting). Evidence: `bench/arrivehour.ts`, #335.
  - a. Of the trips arriving by each 10 minutes of the hour, the quickest would match within a minute in 86 % (38 % before, 44 % now), but takes six searches per tap (68 ms against 11.5 ms in Node). Measure cheaper variants (fewer slots, reusing one search) and the tap in the browser at 360×740.
  - b. Hendrik gets a short table and a recommendation; nothing changes without his yes.

## Now: B. Fast and steady loading and measuring

Outcome: less to download on every visit, and speed numbers that can be trusted.

- **0.13.13 Stop list loaded once** · should · build
  - Why: note from 0.13.6 (2026-10-15): most of every hourly timetable file is the stop list, the same in each: a night file with about 1,000 trips is 258 KB gzipped against 289–303 KB for 7,000–16,000 trips by day.
  - Done when: further hours download only their trips, and the first map stays within noise.
  - a. Split the stop list out of the hourly files into one file loaded once and kept by the service worker; each hourly file then holds only its trips.
  - b. Measure the first map on a fresh visit (one more file, so it must not get slower), a further hour's file, the next-hour preload and Vergleich, before and after, at 360×740.
  - c. Keep it only if the first map stays within noise; the speed budget's file-size check (`scripts/speed/budget.json`) follows the new files.

- **0.13.16 Steadier Node map timings in the speed check** · should · build
  - Why: note from 0.13.8 (2026-10-16): the CI speed job's Node map timings vary by up to ±9 % between runs with no routing change (Köpenick 134 against 123 ms on the same machine), so a budget on them would need several runs or a wider margin.
  - Done when: the job reports medians that stay within a few per cent between runs.
  - a. Run each map several times (for example 5) and report the median, measured against today's single runs on the same machine; the job may take only a little longer.
  - b. If the medians stay within a few per cent, propose a budget on them (a deliberate edit with the reason, as for the file sizes).

## Next: C. Map handling (0.14)

Outcome: moving the anchor is one gesture.

- **0.14.0 Long press moves the anchor** · should · build
  - Why: Hendrik (2026-10-14): "long press moves the anchor point to the chosen location". Today the first map touch sets the anchor and every other tap moves the pin; moving the anchor needs the grey rings button on the trip card.
  - Done when: a long press moves the anchor and a normal tap is not delayed.
  - a. A long press on the map (about 0.5 s, finger held still) moves the anchor there, keeping its role (Start or Ziel), with one compute, the same path as the rings button; before any anchor exists it sets the first one, like the first tap. The pin and its trip card stay where they are, so the card then shows the trip from the new anchor.
  - b. "Rückgängig" (5 s) brings the old anchor back, as for the rings button; links update as usual.
  - c. A short tap, panning and pinch zoom work exactly as before; a long press on a start marker still shows its name. On a computer, a right-click does the same as a long press.
  - d. Check at phone size 360×740 that a normal tap is not delayed by the long-press wait.

## Next: D. Clear and welcoming looks (0.15)

Outcome: a first-time visitor understands the map without help, and nothing covers it. Hendrik (2026-10-14) put the optional design list back on the roadmap before 1.0; each item keeps its D id from that list (archive/plan/optional-design-v1.2-2026-10-14.md). Small fixes first, then the first visit.

- **0.15.0 A little more room at the screen edges** · must · build
  - Why: Hendrik (2026-10-14): "UI elements are now very close to the left and right edges of the display, give them a tiny bit more room".
  - a. List the elements that touch or nearly touch the left and right edges at 360×740 (search bar, chip row ends, trip card, legend, buttons) and their gap today.
  - b. Give them one shared side gap a few pixels wider (for example 8 → 12 px), respecting the phone's safe areas; the map itself stays edge to edge.
  - c. Screenshots before and after at 360×740 for Hendrik; no element wraps onto a new line.
- **0.15.1 Status lines keep the map clear** (D8) · should · build
  - Why: noted after 0.10.10: while footpaths load, the status line covers the map strip between the tip card and the bottom buttons (y 661–680 at 360×740). Fine for its 5 s, but other status lines may stay longer.
  - a. List every status line, where it sits and how long it can stay.
  - b. Any that can stay over the map strip for more than about 5 s moves or shortens; the rest stay as they are.
- **0.15.2 Ring widths show their order** (D7) · could · build
  - Why: noted after 0.11.0: the rings come in look-alike pairs (15/30 near-black, 45/60 mid-purple), told apart mostly by their labels; a different line width per ring could restore the order at a glance.
- **0.15.3 Colour fill on for first-time visitors** (D2) · could · build
  - Trial the colour fill on by default for first-time visitors (same repaint path, no extra routing).
- **0.15.4 Example map on the first screen** (D1) · could · build
  - The first screen shows a finished, coloured example map (for example from Alexanderplatz) before any tap; it must not delay the first real map.
- **0.15.5 Question entries on the start screen** (D3) · could · build
  - Besides "Von meinem Standort", the start screen offers 2–3 question entries: "Wo treffen wir uns?", "Was erreiche ich in 30 Min.?", "Wo soll ich wohnen?".
- **0.15.11 Layout check on devices and browsers** · must · check
  - Why: Hendrik (2026-10-14): "add making a layout and UI consistency check on different devices and browsers to the roadmap". Last in the milestone, so it checks the finished looks (after E and F).
  - a. Screenshots of the main screens (first screen, map with rings, trip card and drawer, Zeit panel, search, Treffpunkt) on small and large phones (for example 360×740, 390×844, 430×932), a tablet and a desktop window, in Chrome, Safari (WebKit) and Firefox, in German and English.
  - b. List what differs or breaks (overlaps, cut-off text, wrong gaps, safe areas, fonts, touch targets under 44 px) and fix the small ones in this step; anything bigger goes to the Inbox.
  - c. Timings on each browser stay as before; the screenshots go to the project files for Hendrik.

## Next: E. Treffpunkt that shows fairness (0.15)

Outcome: the meeting map shows both total time and fairness, in its own look. Three steps in order: D9 → D10 → D11.

- **0.15.6 Treffpunkt looks, options only** (D9) · should · decision
  - Why: Hendrik (2026-10-13): "Treffpunkt does not need to be there as a button on the home screen, when we are in Treffpunkt mode the 3. person button should be the same as in the connection drawer and we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build".
  - a. Five colour codings for the meeting map that show both total time and fairness (for example two-tone fills, hatching for unfair places, or a combined score scale).
  - b. Each shown as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and the "+ Person" button styled as in the trip drawer.
  - c. Nothing changes in the live app in this step.
- **0.15.7 Treffpunkt mode built** (D10) · should · build
  - The option Hendrik picks from 0.15.6 becomes the meeting map; the home-screen button goes and "+ Person" matches the drawer.
  - c. Side note from step 0.12.0 (2026-10-14): today the floating Treffpunkt button brings back the closed person even after other places are tapped, until all starts are cleared; to add someone new instead, you tap "+ Person" once the first person is back. When the button goes, make sure there is still a direct way to start a meeting with someone new.
- **0.15.8 Treffpunkt opens in its own map look** (D11) · should · build
  - Why: Hendrik (2026-10-14): "when Treffpunkt mode is started change map style to it's specific heatmap mode". Today the meeting map keeps whatever look was on (rings or the Heatmap switch).
  - a. Starting Treffpunkt switches the map to the meeting colouring built in 0.15.7 (time and fairness); closing it returns to the look that was on before.
  - b. One repaint, no extra routing on the switch.

## Next: F. New questions to ask (0.15)

Outcome: the map answers "where to go" and "where to live", not only "how long".

- **0.15.9 Places layer** (D4) · could · build
  - Lakes, pools, parks and similar places shown with their minutes, answering "Wohin jetzt?".
- **0.15.10 Two start points side by side** (D5) · could · build
  - Compare the maps of two start points (flat hunting).

## Later: G. Showcase and release (0.16, 1.0)

Outcome: the pictures show the finished app, and the Berlin app is called done. Last, so the pictures show the finished looks.

- **0.16.0 New screenshots and sharepics** · must · build
  - a. Retake the showcase screenshots (showcase/screens/) with the current default map.
  - b. Re-render the German sharepics if they show the default map.
- **0.16.1 Sharepic per use case** (D6) · could · build
  - One picture per question ("one picture, one question") instead of one feature list.
- **1.0.0 Release** · must · build
  - Every must and should step above is live.
  - a. Final check at phone size 360×740 on the live site, with timings.
  - b. Version 1.0.0 and tag `v1.0.0`; a short "what's in 1.0" list in README.md.
  - c. Hendrik's projects overview row updated.

## Inbox

- 2026-10-16 (from 0.13.12): **decision for Hendrik** (0.13.12c): two stop guesses per cell on the map to a Ziel leaving (the second from leaving within 30 minutes instead of 10) bring the places 3 or more minutes apart from the tapped trip from 11 / 16 / 11 % to 10 / 13 / 8 % (Alexanderplatz, Spandau, Köpenick; 300 places each, `GUESS2=1800 bench/goal.ts`; 1 s, 5, 20 and 40 minutes do no better), not halved, for +80–130 ms per map in Node (60–90 % more). Recommendation: leave it as it is.
- 2026-10-16 (from 0.13.12): the tap on the map to a Ziel leaving still takes about twice the arrival map's in Node (5–8 against 3–4 ms: three searches against one, the arrival map's tap gets the map's own pass); in the browser 195 against about 175 ms. The latest leaving (its second search) might be read off the map's profile search.
- 2026-10-16 (from 0.13.12): under Typisch the lines of the map to a Ziel leaving still follow a pass arriving 40 minutes on (its cells average the hour and take no one trip).
- 2026-10-16 (from 0.13.12): worker.js is 33.1 KB gzipped, about 130 bytes under its budget limit (31.2 KB + 1 % + 1 KB); the next worker change will need a deliberate raise in `scripts/speed/budget.json`.
