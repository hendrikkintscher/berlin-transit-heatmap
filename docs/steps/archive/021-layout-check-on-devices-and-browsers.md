---
id: 021
title: Layout check on devices and browsers
type: build
kind: chore
priority: P1
size: M
needs: S018
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The finished looks are consistent on different devices and browsers.

## Acceptance criteria
- [x] Screenshots of the main screens (first screen, map with rings, trip card and drawer, Zeit panel, search, Treffpunkt) on 360×740, 390×844, 430×932, a tablet and a desktop window, in Chrome, Safari (WebKit) and Firefox, in German and English
- [x] What differs or breaks (overlaps, cut-off text, gaps, safe areas, fonts, touch targets under 44 px) is listed; small fixes in this step, bigger ones become new steps
- [x] Timings on each browser stay as before; the screenshots go to the project files for Hendrik

## Notes
- Planned as 0.15.11. Hendrik (2026-10-14): "add making a layout and UI consistency check on different devices and browsers to the roadmap". Runs after the looks (D, E, F) are finished.

## Results
- `scripts/layout/screens.mjs`: 8 screens (first, map, trip, drawer, zeit, search, menu, treffpunkt) × 5 sizes
  (360×740, 390×844, 430×932, 820×1180, 1280×800) × de/en in Chromium, plus an iPhone notch and home bar
  (`--safe 47,34`); WebKit and Firefox at 360/390 px in the workflow `layout.yml` (the container has only Chromium).
- Fixed: the welcome card over the example map overlapped the locate button with a home bar; the bottom tip
  showed below the Zeit panel and the menu; iOS zoomed into the time field and the selects (under 16 px).
- Kept as they are (deliberate): 40 px panel and menu buttons (S029), 30 px rings dot on the card's rows (S031),
  34 px question entries (S015, keeps the example's start in view), hour buttons 35 px wide at 360 px, the day
  row scrolling sideways. MapLibre's (i) is 24 px. On tablet and desktop the phone layout is stretched: the
  desktop layout is in docs/specs/later.md.
- Static check: the app needs Safari 16.4+ and Firefox 121+ (`:has()`, `dvh`, module workers, ES2022).
- Screenshots: a private page for Hendrik (the project files cannot be reached from the cloud session).
