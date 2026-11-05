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

- Desktop browser layout · personal heatmap colours · two start points side by side · other regions (Oldenburg first, after 1.0) ·
  own web address · app store release (iOS)

## Steps

<!-- Lines look like:  - S004 · build · fix · P1 · S · needs S002 · Export crashes on empty project
     (id · type · kind · priority · size · needs · title).
     Create/change them only with scripts/steps.sh new / tag — don't type them by hand.
     Themes (### headings) group the steps in Now / Next / Later order; a new step lands at the end,
     moving its line into its theme is fine. -->

### Now · B. Fast and steady loading and measuring (0.13)

### Next · C. Map handling (0.14)

### Next · D. Clear and welcoming looks (0.15)

### Next · E. Treffpunkt that shows fairness (0.15)

### Next · F. New questions to ask (0.15)

- S019 · build · feature · P3 · M · Places layer

### Later · G. Showcase and release (0.16, 1.0)

- S022 · build · chore · P1 · S · needs S019, S035 · New screenshots and sharepics
- S023 · build · feature · P3 · S · needs S022 · Sharepic per use case
- S024 · build · chore · P1 · S · needs S022, S035 · Release 1.0.0
