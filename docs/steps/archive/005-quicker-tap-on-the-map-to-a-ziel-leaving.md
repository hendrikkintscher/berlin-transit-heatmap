---
id: 005
title: Quicker tap on the map to a Ziel leaving
type: decision
kind: research
priority: P3
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The tap on the map to a Ziel leaving is as quick as the arrival map's tap.

## Decision
- Question: Can the latest leaving (the tap's second search) be read off the map's profile search?
- Measure: How much of the tap that saves in Node and in the browser at 360×740 (also with the page CPU slowed 4×), with the trips unchanged.
- Results (2026-11-03, weekday 10 Uhr, 3 Ziele × 300 random places leaving 10:57, `packages/routing/bench/latest.ts`): yes. The latest leaving is read off the map's profile and checked by the trip leaving then (where the fewest-rides trip leaves earlier, the search runs as before). Same trip in 1799 of 1799 taps.

  | Tap in Node, per tap | Alexanderplatz | Spandau Rathaus | Köpenick |
  | --- | --- | --- | --- |
  | today (three searches) | 7.7 ms | 10.6 ms | 10.3 ms |
  | Nächste's profile | 6.7 ms (−13 %) | 8.1 ms (−24 %) | 8.6 ms (−16 %) |
  | Typisch/Bestfall's profile | 7.3 ms (−5 %) | 9.7 ms (−9 %) | 9.2 ms (−11 %) |
  | arriving map's tap | 4.0 ms | 4.7 ms | 6.1 ms |

  Browser at 360×740 (Alexanderplatz, 6 taps × 8 visits, main → branch): tap to trip Nächste 119 → 118 ms, Typisch 110 → 113 ms; 4× CPU Nächste 186/177/183 → 202/178/172 ms, Typisch 182 → 188 ms; first map unchanged (within noise). The worker's answer to a tap takes ~110 ms there against ~8 ms of searching, so the gain does not show in the browser (new step S026).
- Decided by Claude under Hendrik's standing instruction for minor decisions (no slowdown, trips unchanged): decision 0006, built in the same PR.

## Notes
- Planned as 0.13.19. Note from 0.13.12 (2026-10-16): that tap takes about twice the arrival map's in Node (5–8 against 3–4 ms: three searches against one); in the browser 195 against about 175 ms.
