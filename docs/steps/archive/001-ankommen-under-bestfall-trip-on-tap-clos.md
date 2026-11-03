---
id: 001
title: Ankommen under Bestfall: trip on tap closer to the map
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
Under Bestfall with Ankommen, the trip on tap and the map's minutes tell the same story more often.

## Decision
- Question: Should the tap search several arrival slots of the hour and show the quickest, and at what cost?
- Measure: Of the trips arriving by each 10 minutes of the hour, the quickest matches within a minute in 86 % (38 % before, 44 % now), but takes six searches per tap (68 against 11.5 ms in Node). Measure cheaper variants (fewer slots, reusing one search) and the tap in the browser at 360×740.
- Results (2026-11-03, `bench/arriveslots.ts`, 390 places to 3 Ziele, arriving 11–12; browser: 7 fresh visits × 6 taps at 360×740, to Alexanderplatz):

  | Trip on tap arrives by | within 1 min of map | 3+ min apart | tap (Node) |
  |---|---|---|---|
  | end of the hour (today) | 45–49 % | 48–51 % | 2.5 ms |
  | best of 2 slots | 63–66 % | 31–33 % | 9 ms |
  | best of 3 slots | 65–72 % | 25–32 % | 15 ms |
  | best of 6 slots | 85–87 % | 11–12 % | 33 ms |
  | the cell's quickest trip (map pass keeps each stop's best moment) | 90–92 % | 6–8 % | 6.5 ms |

  Browser, quickest-trip prototype against main: tap→trip median 83 → 88 ms (4× CPU 127 → 130), first tap 94 → 115 ms (4×: 159 → 179), first map unchanged (834 / 841 ms; 4×: 1528 / 1550).
  Recommendation: the map pass keeps each stop's quickest moment and the tap asks for the trip arriving then (prototype in project files measure-S001).
- Decided 2026-11-03: Hendrik said yes to the cell's quickest trip (decision 0002). Built (8 visits × 6 taps, interleaved with main): tap 83 → 92 ms (4×: 130 → 134), first tap 101 → 114 ms (4×: 154 → 161), first map unchanged.

## Notes
- Planned as 0.13.18. Note from 0.13.11 (2026-10-16): the trip on tap (the last connection of the hour) is 3+ minutes off the map in 53 % of places. Typisch differs by design (the map counts waiting).
- Evidence: `packages/routing/bench/arrivehour.ts`, #335.
