---
id: 034
title: Colour scale: yellow from 25, red from 45, purple from 60, blue from 90
type: build
kind: feature
priority: P2
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The colour fill follows Hendrik's scale (2026-11-03): green below 25 min as before, yellow from 25 (to orange), red only from 45, purple from 60, blue from 90. Legend ticks and the help text match.

## Build steps only — acceptance criteria
- [x] 25–45 min yellow to orange, no red before 45; 45–60 red; 60–90 purple; 90–120 blue; 120+ grey
- [x] Under 25 min unchanged (same greens, same 0–25 bands)
- [x] Legend ticks at the colour changes (0, 10, 25, 35, 45, 60, 90, 120); help text names the colours
- [x] Neighbouring bands stay visibly distinct (OKLab > 0.05)
- [x] Tests cover the new behaviour

## Notes
Bands 60–90 split into 60/70/80 and 90–120 into 90/105 (were 60/75 and 90), so purple and blue get room. 120+ stays grey.
