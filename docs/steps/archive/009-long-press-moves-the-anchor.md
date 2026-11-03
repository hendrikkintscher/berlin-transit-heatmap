---
id: 009
title: Long press moves the anchor
type: build
kind: feature
priority: P2
size: M
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Moving the anchor is one gesture: a long press.

## Acceptance criteria
- [x] A long press (about 0.5 s, finger held still) moves the anchor there, keeping its role (Start or Ziel), with one compute, the same path as the rings button; before any anchor exists it sets the first one
- [x] The pin and its trip card stay, so the card shows the trip from the new anchor; "Rückgängig" (5 s) brings the old anchor back; links update as usual
- [x] A short tap, panning and pinch zoom work as before; a long press on a start marker still shows its name; a right-click on a computer does the same as a long press
- [x] A normal tap is not delayed by the long-press wait (checked at 360×740)

## Notes
- Planned as 0.14.0 (first step of milestone 0.14: `bump minor`). Hendrik (2026-10-14): "long press moves the anchor point to the chosen location".
