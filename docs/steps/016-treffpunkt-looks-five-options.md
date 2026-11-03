---
id: 016
title: Treffpunkt looks: five options
type: decision
kind: research
priority: P2
size: M
needs: -
status: waiting
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Hendrik picks a look for the meeting map that shows both total time and fairness.

## Decision
- Question: Which of five colour codings should the meeting map use?
- Measure: Five colour codings (for example two-tone fills, hatching for unfair places, a combined score scale), each as a screenshot of the same meeting at phone size, with the Treffpunkt button gone from the home screen and "+ Person" styled as in the trip drawer. Nothing changes in the live app.
- Results (measured 2026-11-03, prototype branch `proto-s016`, not for main; screenshots and
  scripts in `/mnt/project-files/measure-S016/`): the same meeting (Pankow + Steglitz,
  Mo–Fr ab 10 Uhr) in today's look and five codings. Every look drops the Treffpunkt button
  from the home screen (Treffpunkt is started from the start card's "Wo treffen wir uns?")
  and shows "+ Person" as a round icon button like the trip drawer's.

  | Look | Colour | Fairness | Worker per meeting map | Reads as |
  | --- | --- | --- | --- | --- |
  | 0 today | minutes over the best spot (app's scale) | not shown | 238 ms | the usual heat map; green everywhere, no fairness |
  | 1 two colours | 3x3: teal = quick, red = unfair | second colour axis | +88 ms | blocky, three classes each; hard to read on a phone |
  | 2 hatching | own teal→coral ramp (Ø min. over the best) | diagonal hatch from 15 min gap | +135 ms | busy; the hatch fights the lines and the base map |
  | 3 greying | same ramp | fades to grey from 8 to 20 min gap | +215 ms | calm: colour = time, washed out = unfair |
  | 4 score | the suggestions' score (slowest + Ø) | folded into the one number | +69 ms | one smooth field, but the number means nothing to a reader |
  | 5 lines | same ramp | dashed lines at 10 and 20 min gap | +141 ms | clear if the lines are read; they clash with the time lines |

  Worker cost is the paint + the lines for the whole grid, median of 11 on the real
  10 Uhr data; it only applies to maps with two or more starts. In the browser at
  360x740 the differences stay inside the noise (first map 2.1-2.4 s at 1x, 2.7-3.3 s at
  4x CPU; tap->trip 0.8-1.1 s), so none of them is felt on a tap; look 3's +215 ms would
  show on a slow phone and can be halved (blur the gap at half resolution).

- Recommendation: look 3 (greying). Colour keeps meaning "how long for the group", and a
  place everyone can reach about equally stays bright while an unfair one washes out; the
  time lines and the three suggestion pins stay readable. Look 5 is the fallback if the
  fairness should be readable in exact minutes.

## Notes
- Planned as 0.15.6 (design list D9). Hendrik (2026-10-13): "Treffpunkt does not need to be there as a button on the home screen, … we need our own color coding for the Treffpunkt mode, ideally including both dimensions: total time and fairness. There should be 5 suggestions to decide from, before it gets build".
