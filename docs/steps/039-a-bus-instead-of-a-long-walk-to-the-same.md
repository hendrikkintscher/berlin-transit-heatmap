---
id: 039
title: A bus instead of a long walk to the same train
type: decision
kind: research
priority: P2
size: S
needs: S040
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Decide whether the trip on tap should take a feeder bus instead of a long walk when both reach the
same train (same arrival), and from how many minutes of walking.

## Decision steps only
- Question: with the same arrival, when is one more ride better than a long walk at the start or end?
- Measure: bench/providers.ts (seed 36): same arrival as VBB (±1 min) but 3+ min more walking at the ends in 29 of 294 trips (10 %; median 7 min more, up to 21 min, e.g. #3 walk 21 min to S Zehlendorf where VBB takes the 115); the app leaves 10+ min earlier than VBB for the same arrival in 2 %. Compare rules (walk over N min → prefer a ride that saves M min) on those trips and on the map/tap agreement.
- Results: <table goes here once measured; recommendation in one line>

## Notes
- Suite (seed 40, 2026-11-06): same arrival as VBB with 3+ min more walking at the start or end in 12.1 % on foot,
  6.6 % arriving, 11.4 % step-free; of the trips where the app is 3+ min earlier than VBB, 79 of 223 walk 15+ min at an end.
- Possible design: on tap, the journey for each number of rides is in RAPTOR's rounds (rounds.arrivals; tripBetween's
  fewestRides uses them). Among rounds arriving as early, take one more ride when it saves N+ min of walking; the map
  stays. Measure N = 3/5/8 with bench/suite.ts --vbb (target < 3 %).
- The arrival and the map stay the same; only which way the card shows changes.
