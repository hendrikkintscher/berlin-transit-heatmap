---
id: 003
title: Last hour of rolling on from the clock hour's file
type: build
kind: fix
priority: P2
size: M
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
A card rolled on into the second hour after the chosen one finds the same trips as the clock hour's own file.

## Acceptance criteria
- [ ] Rolling on into that hour loads the clock hour's file (one more download while the card stays open, 40–60 KB gzipped) and searches on it
- [ ] `packages/routing/bench/rollon.ts` shows the same trips as on the clock hour's own file
- [ ] The card's countdown does not stall while the file loads (checked at 360×740)
- [ ] Tap timings unchanged; tests cover the new file choice

## Notes
- Planned as 0.13.23. Note from 0.13.14 (2026-10-16): in that hour the next hour's file runs out, so 8–15 % of trips come out as "keine Verbindung" and 8–11 % later than on the clock hour's own file.
