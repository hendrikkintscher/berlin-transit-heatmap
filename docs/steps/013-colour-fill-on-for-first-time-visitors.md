---
id: 013
title: Colour fill on for first-time visitors
type: build
kind: feature
priority: P3
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
First-time visitors see the colour fill by default.

## Acceptance criteria
- [ ] The colour fill is on by default for first-time visitors (same repaint path, no extra routing)
- [ ] Returning visitors keep their choice
- [ ] The colour fill hides when a tap on the map opens a trip, and comes back when that trip
      window is closed (Hendrik, 2026-11-03)

## Notes
- Planned as 0.15.3 (design list D2), a trial.
- Hiding the fill on a tap must not slow the tap to trip; it is a paint switch, no new routing.
