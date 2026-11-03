# Roadmap

<!-- INDEX ONLY. Max 80 lines (a hook enforces this). Details live in docs/steps/.
     The top unblocked step is the next one. Finished steps are removed by `scripts/steps.sh done NNN`. -->

## Vision

A map you can trust, faster than you can ask the next question: the Berlin app finished at 1.0.0.
Every step is judged first by the timings at 360×740 (also with the page CPU slowed 4×), then by
agreement between the trip on tap and the map's minutes. A step that slows any timing does not ship.

## Out of scope

- Android app (native or TWA) and beta testing: Hendrik, 2026-10-13. Notes in archive/plan/.
- Set aside 2026-10-12, only if Hendrik asks again: fare zones on the map (C5), sharing a picture of
  the map (C7), population within N minutes (C4), dark map and icon shortcuts (C9).

## Later (not scheduled)

Becomes a step only when Hendrik says so. Details in [docs/specs/later.md](docs/specs/later.md).

- Desktop browser layout · personal heatmap colours · other regions (Oldenburg first, after 1.0) ·
  own web address · app store release (iOS)

## Steps

<!-- Lines look like:  - S004 · build · fix · P1 · S · needs S002 · Export crashes on empty project
     (id · type · kind · priority · size · needs · title).
     Create/change them only with scripts/steps.sh new / tag — don't type them by hand.
     Themes (### headings) group the steps in Now / Next / Later order; a new step lands at the end,
     moving its line into its theme is fine. -->

### Now · A. Trip and map agree (0.13)

- S002 · decision · research · P3 · S · Typisch lines on the map to a Ziel leaving
- S003 · build · fix · P2 · M · Last hour of rolling on from the clock hour's file
- S004 · decision · research · P3 · S · Long walk on the trip card over the 30-minute walk rule

### Now · B. Fast and steady loading and measuring (0.13)

- S005 · decision · research · P3 · S · Quicker tap on the map to a Ziel leaving
- S006 · build · feature · P2 · XS · More hours kept offline
- S007 · build · refactor · P3 · S · Station numbers in the stop list
- S008 · decision · research · P3 · S · Footpaths sooner on a slow line

### Next · C. Map handling (0.14)

- S009 · build · feature · P2 · M · Long press moves the anchor

### Next · D. Clear and welcoming looks (0.15)

- S010 · build · fix · P1 · S · A little more room at the screen edges
- S011 · build · fix · P2 · S · Status lines keep the map clear
- S012 · build · feature · P3 · XS · Ring widths show their order
- S013 · build · feature · P3 · XS · Colour fill on for first-time visitors
- S014 · build · feature · P3 · M · Example map on the first screen
- S015 · build · feature · P3 · S · Question entries on the start screen

### Next · E. Treffpunkt that shows fairness (0.15)

- S016 · decision · research · P2 · M · Treffpunkt looks: five options
- S017 · build · feature · P2 · M · needs S016 · Treffpunkt mode built
- S018 · build · feature · P2 · S · needs S017 · Treffpunkt opens in its own map look

### Next · F. New questions to ask (0.15)

- S019 · build · feature · P3 · M · Places layer
- S020 · build · feature · P3 · M · Two start points side by side

### Later · G. Showcase and release (0.16, 1.0)

- S021 · build · chore · P1 · M · needs S018 · Layout check on devices and browsers
- S022 · build · chore · P1 · S · needs S021 · New screenshots and sharepics
- S023 · build · feature · P3 · S · needs S022 · Sharepic per use case
- S024 · build · chore · P1 · S · needs S021, S022 · Release 1.0.0
