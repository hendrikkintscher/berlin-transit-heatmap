---
id: 010
title: A little more room at the screen edges
type: build
kind: fix
priority: P1
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
UI elements get a little more room at the left and right screen edges.

## Acceptance criteria
- [ ] The elements that touch or nearly touch the edges at 360×740 (search bar, chip row ends, trip card, legend, buttons) and their gap today are listed
- [ ] One shared side gap a few pixels wider (for example 8 → 12 px), respecting safe areas; the map stays edge to edge
- [ ] Screenshots before and after at 360×740 for Hendrik; no element wraps onto a new line

## Notes
- Planned as 0.15.0 (first step of milestone 0.15: `bump minor`). Hendrik (2026-10-14): "UI elements are now very close to the left and right edges of the display, give them a tiny bit more room".
