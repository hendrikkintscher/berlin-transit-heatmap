---
id: 029
title: Tidier time menu and smaller menu buttons
type: build
kind: fix
priority: P2
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The time menu is tidy and the buttons in the menus are smaller, so more fits on a phone screen.

## Build steps only — acceptance criteria
- [ ] The time menu's rows and buttons are listed before and after, with what was merged, moved or dropped
- [ ] Menu buttons are smaller (less height and padding) but still easy to tap (at least about 40 px high)
- [ ] Screenshots before and after at 360×740 for Hendrik; nothing wraps onto a new line
- [ ] Timings at 360×740 (also 4×) unchanged against main
- [ ] Tests cover the new behaviour

## Notes
- Hendrik, 2026-11-03: "the time menu needs to be cleaned up, buttons in the menus are too big. lieblingsorte can be a button next to the layers button. in the connection view the display of which point ziel or start is anchored is too much, it could be design wise integrated into the dots on the left of Start and Ziel"
- Menus here: the time menu and the main menu (⋯); S030 moves Lieblingsorte out separately.
