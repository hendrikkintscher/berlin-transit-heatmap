# Optional design decisions V1.0

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

## Changelog

- **V1.0** (2026-10-14): list started with the seven roadmap Inbox items (D1–D7). Other roadmap steps are being reviewed with Hendrik one at a time; each one he moves here is added with a new id.
