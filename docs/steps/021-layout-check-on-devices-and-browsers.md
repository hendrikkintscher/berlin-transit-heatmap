---
id: 021
title: Layout check on devices and browsers
type: build
kind: chore
priority: P1
size: M
needs: S018
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The finished looks are consistent on different devices and browsers.

## Acceptance criteria
- [ ] Screenshots of the main screens (first screen, map with rings, trip card and drawer, Zeit panel, search, Treffpunkt) on 360×740, 390×844, 430×932, a tablet and a desktop window, in Chrome, Safari (WebKit) and Firefox, in German and English
- [ ] What differs or breaks (overlaps, cut-off text, gaps, safe areas, fonts, touch targets under 44 px) is listed; small fixes in this step, bigger ones become new steps
- [ ] Timings on each browser stay as before; the screenshots go to the project files for Hendrik

## Notes
- Planned as 0.15.11. Hendrik (2026-10-14): "add making a layout and UI consistency check on different devices and browsers to the roadmap". Runs after the looks (D, E, F) are finished.
