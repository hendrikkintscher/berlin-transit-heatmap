---
id: 003
title: Last hour of rolling on from the clock hour's file
type: build
kind: fix
priority: P2
size: M
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
A card rolled on into the second hour after the chosen one finds the same trips as the clock hour's own file.

## Acceptance criteria
- [x] Rolling on into that hour loads the clock hour's file (one more download while the card stays open, 40–60 KB gzipped) and searches on it
- [x] `packages/routing/bench/rollon.ts` shows the same trips as on the clock hour's own file
- [x] The card's countdown does not stall while the file loads (checked at 360×740)
- [x] Tap timings unchanged; tests cover the new file choice

## Result
- Built in 0.13.20 (2026-11-03). `rollon.ts`, 150 random pairs, weekday: in the second hour after the chosen one (19:06–19:48 after 17 Uhr, 1:06–1:48 after 23 Uhr) the card now finds exactly the clock hour's own trips; the file it used before missed 0–30 of them ("keine Verbindung") and had 0–16 later. 19 Uhr file 61 KB gzipped, 1 Uhr 20 KB. Tap 84 → 78 ms (4× CPU 123 → 114 ms), first map unchanged within noise.

## Notes
- Planned as 0.13.23. Note from 0.13.14 (2026-10-16): in that hour the next hour's file runs out, so 8–15 % of trips come out as "keine Verbindung" and 8–11 % later than on the clock hour's own file.
