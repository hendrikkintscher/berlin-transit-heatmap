# Optional design decisions V1.1

Design ideas and add-ons that are optional for now (Hendrik, 2026-10-14: "All of the current roadmaps are part of something I would call optional design decisions for now, lump them together in a separate document and make a milestone in the roadmap for those"). None of them is needed for the 1.0.0 release.

## How to use this list

- Nothing here is built unless Hendrik picks it. A picked item moves back into a numbered milestone of ROADMAP.md and gets a version there (`0.N.k`); it is then removed from this list.
- Items carry an id (`D1`, `D2` …) that never changes, so they can be named in chat.
- ROADMAP.md has the milestone "Optional design decisions" pointing here. This file and the project copy plan/optional-design.md stay identical (docs-only PR, `npx prettier --write OPTIONAL-DESIGN.md`).
- Every edit bumps `V1.x` and adds a changelog line at the bottom.

## First visit: making the map understood

From the thread "Why people don't get the map" (2026-10-14).

- **D1 Example map on the first screen**. The first screen shows a finished, coloured example map (for example from Alexanderplatz) before any tap.
- **D2 Colour fill on for first-time visitors**. Trial the colour fill on by default for first-time visitors (same repaint path, no extra routing).
- **D3 Question entries on the start screen**. Besides "Von meinem Standort", the start screen offers 2–3 question entries: "Wo treffen wir uns?", "Was erreiche ich in 30 Min.?", "Wo soll ich wohnen?".

## Add-ons

- **D4 Places layer**. Lakes, pools, parks and similar places shown with their minutes, answering "Wohin jetzt?".
- **D5 Two start points side by side**. Compare the maps of two start points (flat hunting).
- **D6 Sharepic per use case**. One picture per question ("one picture, one question") instead of one feature list.

## Map looks

- **D7 Ring widths show their order**. Noted after 0.11.0: the rings now come in look-alike pairs (15/30 near-black, 45/60 mid-purple), told apart mostly by their labels; a different line width per ring could restore the order at a glance.

## Status lines

- **D8 Status lines keep the map clear** (was roadmap step 0.11.1). Noted after 0.10.10: while footpaths load, the status line covers the map strip between the tip card and the bottom buttons (y 661–680 at 360×740). Fine for its 5 s, but other status lines may stay longer.
  - a. List every status line, where it sits and how long it can stay.
  - b. Any that can stay over the map strip for more than about 5 s moves or shortens; the rest stay as they are.

## Treffpunkt looks

One package: D10 needs D9, D11 needs D10.

- **D9 Treffpunkt looks, options only** (was roadmap step 0.12.0). Hendrik (2026-10-13): "Treffpunkt does not need to be there as a button on the home screen, when we are in Treffpunkt mode the 3. person button should be the same as in the connection drawer and we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build".
  - a. Five colour codings for the meeting map that show both total time and fairness (for example two-tone fills, hatching for unfair places, or a combined score scale).
  - b. Each shown as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and the "+ Person" button styled as in the trip drawer.
  - c. Nothing changes in the live app in this step.
- **D10 Treffpunkt mode built** (was roadmap step 0.12.1): the option Hendrik picks from D9 becomes the meeting map; the home-screen button goes and "+ Person" matches the drawer.
- **D11 Treffpunkt opens in its own map look** (was roadmap step 0.12.3). Hendrik (2026-10-14): "when Treffpunkt mode is started change map style to it's specific heatmap mode". Today the meeting map keeps whatever look was on (rings or the Heatmap switch).
  - a. Starting Treffpunkt switches the map to the meeting colouring built in D10 (time and fairness); closing it returns to the look that was on before.
  - b. One repaint, no extra routing on the switch.

## Changelog

- **V1.1** (2026-10-14): Hendrik moved roadmap step 0.11.1 here as D8 and the Treffpunkt looks 0.12.0, 0.12.1, 0.12.3 as D9–D11. He kept 0.12.2 (now 0.12.0) and 0.14 in the roadmap; 0.13 and 1.0 are not design. The review of the roadmap is complete.
- **V1.0** (2026-10-14): list started with the seven roadmap Inbox items (D1–D7). Other roadmap steps are being reviewed with Hendrik one at a time; each one he moves here is added with a new id.
