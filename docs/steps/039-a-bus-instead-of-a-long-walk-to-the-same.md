---
id: 039
title: A bus instead of a long walk to the same train
type: decision
kind: research
priority: P2
size: S
needs: S040
status: waiting
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
- Results (2026-11-06, `bench/feeder.ts`: 300 trips on foot, seed 36, from 20261107, days 1–6, VBB asked for
  all; rule = the trip with the walks at both ends capped at N min, taken when it still arrives within M of the
  best — RAPTOR records a round only when it arrives earlier, so the alternative needs a second pass, 8 ms):

  | Rule (end walks capped / may arrive later) | Trips changed | Walk saved (median) | of which more rides | Latest arrival vs best | Trips with a 15+ min walk at an end | VBB 3+ min better | Same arrival as VBB, 3+ min more walking |
  | --- | --: | --: | --: | --: | --: | --: | --: |
  | as today (30 min walks, fewest rides) | 0 % | – | – | 0 s | 26.3 % | 12.0 % | 10.0 % |
  | 5 min / +0 s | 9.0 % | 8.5 min | 78 % | 0 s | 22.7 % | 12.0 % | 6.7 % |
  | 8 min / +0 s | 11.7 % | 10.3 min | 77 % | 0 s | 20.7 % | 12.0 % | 7.3 % |
  | 10 min / +0 s | 12.3 % | 13.2 min | 84 % | 0 s | 18.7 % | 12.0 % | 6.3 % |
  | 15 min / +0 s | 8.7 % | 16.6 min | 92 % | 0 s | 18.0 % | 12.0 % | 8.3 % |
  | 10 min / +60 s | 13.3 % | 13.2 min | 80 % | 25 s | 18.7 % | 12.0 % | 6.0 % |
  | 10 min / +0 s, only when it saves 3+ min | 11.3 % | 14.3 min | 85 % | 0 s | 19.0 % | 12.0 % | 6.3 % |

  No rule gets the "same arrival, 3+ min more walking" below the 3 % target: the rest is where VBB's
  trip differs in other ways (stops, walking speed, change times — S042). Allowing a later arrival buys
  nothing. Recommendation: cap 10 min at both ends, same arrival (+0 s), taken only when it saves 3+ min of
  walking: 11 % of trips change, they walk 14 min less (median), the map's minutes and the arrival stay.

## Notes
- Suite (seed 40, 2026-11-06): same arrival as VBB with 3+ min more walking at the start or end in 12.1 % on foot,
  6.6 % arriving, 11.4 % step-free; of the trips where the app is 3+ min earlier than VBB, 79 of 223 walk 15+ min at an end.
- Possible design: on tap, the journey for each number of rides is in RAPTOR's rounds (rounds.arrivals; tripBetween's
  fewestRides uses them). Among rounds arriving as early, take one more ride when it saves N+ min of walking; the map
  stays. Measure N = 3/5/8 with bench/suite.ts --vbb (target < 3 %).
- The arrival and the map stay the same; only which way the card shows changes.
- Build, if yes (S, routing + worker): in the trip on tap (worker-runs nowRun / appJourney in the benches) a
  second RAPTOR pass with maxInitialWalk/maxFinal/maxFallback = 600 s; take its journey when it arrives at the
  same second and its end walks are 180+ s shorter. Same for Ankommen (reversed) and trips between two places
  (tripBetween). Rerun `bench/feeder.ts` and `bench/suite.ts --vbb` after.
