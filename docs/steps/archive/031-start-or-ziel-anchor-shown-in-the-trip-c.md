---
id: 031
title: Start or Ziel anchor shown in the trip card's dots
type: build
kind: fix
priority: P2
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The trip card shows which point is anchored (Start or Ziel) in the dots left of Start and Ziel,
instead of the separate, bigger display it has today.

## Build steps only — acceptance criteria
- [x] The anchored point's dot looks different (for example filled or with a pin mark), the other stays plain
- [x] The separate anchor display in the trip card is gone, or much smaller
- [x] Long press and ⇅ still move or swap the anchor, and the dot follows
- [x] Screenshots before and after at 360×740 for Hendrik; timings (tap to trip, ⇅) unchanged against main
- [x] Tests cover the new behaviour

## Notes
- Hendrik, 2026-11-03: "the time menu needs to be cleaned up, buttons in the menus are too big. lieblingsorte can be a button next to the layers button. in the connection view the display of which point ziel or start is anchored is too much, it could be design wise integrated into the dots on the left of Start and Ziel"
- Built 2026-11-03 (0.15.5): the rings replace the anchored row's dot (in its marker colour), the other row's dot is the button that moves the rings there (30 px tap area); the rings column at the right end of the rows is gone.
