---
id: 002
title: Typisch lines on the map to a Ziel leaving
type: decision
kind: research
priority: P3
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Under Typisch, the lines of the map to a Ziel leaving follow the trips people would take.

## Decision
- Question: Should those lines come from the cells' most common trips instead of a pass arriving 40 minutes on?
- Measure: How far today's lines are from the lines of the trips on tap over random places, and what lines from the cells' most common trips would cost per map.
- Results (2026-11-03, `packages/routing/bench/typlines.ts`, weekday 10:00, on foot, 5 Ziele x 300 random places, seeds 7 and 11 agree within 2 points; trip on tap leaving on the hour or at a random minute):

  | Lines from | Hops drawn | Tap trips' hops on them | Tap trips wholly on them | Drawn lines ridden by a tap trip | Map + lines (Node) |
  |---|---|---|---|---|---|
  | Today: pass arriving 40 min on | 903 | 57 % | 24 % | 81 % | - |
  | Same pass at 50-70 min | 1178-1430 | 61-62 % | 29-31 % | 75-81 % | +0 |
  | Each stop's cells over its trips by share of the hour | 856 | 67 % | 34 % | 93 % | +10 ms (legs +5, lines +6) |
  | Each cell's trips over the hour (its own walk) | 1239 | 70 % | 38 % | 86 % | +110 ms |
  | Each stop's trip serving the most of the hour | 1746 | 72 % | 42 % | 78 % | +35 ms |
  | Vehicle caught leaving on the hour | 1243 | 71 % | 39 % | 86 % | +40 ms |

  Recommendation: lines from each stop's cells spread over its trips by the share of the hour (row 3): fewer lines, a third more of the tap trips on them, 93 % of drawn lines really ridden; only Typisch maps to a Ziel leaving get about 10 ms slower (of ~200 ms), every other map and every tap unchanged.
- Decision (2026-11-03): Hendrik said yes; built in 0.13.19, decision 0003.

## Notes
- Planned as 0.13.20. Note from 0.13.12 (2026-10-16): Typisch cells average the hour and take no one trip; Nächste and Bestfall follow the cells' own trips since 0.13.12.
