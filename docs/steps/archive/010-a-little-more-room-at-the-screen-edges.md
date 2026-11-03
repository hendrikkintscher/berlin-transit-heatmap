---
id: 010
title: A little more room at the screen edges
type: build
kind: fix
priority: P1
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
UI elements get a little more room at the left and right screen edges.

## Acceptance criteria
- [x] The elements that touch or nearly touch the edges at 360×740 (search bar, chip row ends, trip card, legend, buttons) and their gap today are listed: search bar, first chip, tip, bottom row (locate, Treffpunkt), chip panels, menu, colour legend, small Treffpunkt banner 10 px; Mehr 8 px; the trip card's text 12 px inside the edge-to-edge sheet
- [x] One shared side gap a few pixels wider (for example 8 → 12 px), respecting safe areas; the map stays edge to edge: `--edge` 12 px plus the safe area, everywhere above, the card's text 14 px
- [x] Screenshots before and after at 360×740 for Hendrik; no element wraps onto a new line (the Mo–Fr chips still fit beside Mehr: the arrow chips end 3 px closer to their arrow)

## Notes
- Planned as 0.15.0 (first step of milestone 0.15: `bump minor`). Hendrik (2026-10-14): "UI elements are now very close to the left and right edges of the display, give them a tiny bit more room".
