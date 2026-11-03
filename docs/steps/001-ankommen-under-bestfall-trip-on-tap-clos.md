---
id: 001
title: Ankommen under Bestfall: trip on tap closer to the map
type: decision
kind: research
priority: P3
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Under Bestfall with Ankommen, the trip on tap and the map's minutes tell the same story more often.

## Decision
- Question: Should the tap search several arrival slots of the hour and show the quickest, and at what cost?
- Measure: Of the trips arriving by each 10 minutes of the hour, the quickest matches within a minute in 86 % (38 % before, 44 % now), but takes six searches per tap (68 against 11.5 ms in Node). Measure cheaper variants (fewer slots, reusing one search) and the tap in the browser at 360×740.
- Results: <table and one-line recommendation once measured; nothing changes without Hendrik's yes>

## Notes
- Planned as 0.13.18. Note from 0.13.11 (2026-10-16): the trip on tap (the last connection of the hour) is 3+ minutes off the map in 53 % of places. Typisch differs by design (the map counts waiting).
- Evidence: `packages/routing/bench/arrivehour.ts`, #335.
