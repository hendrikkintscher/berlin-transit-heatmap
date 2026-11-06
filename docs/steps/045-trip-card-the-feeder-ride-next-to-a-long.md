---
id: 045
title: Trip card: the feeder ride next to a long walk, same arrival
type: build
kind: feature
priority: P2
size: M
needs: S039
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Decision 0012: when the trip on tap walks more than 10 minutes at the start or end, the card keeps
that walk and adds the ride that arrives at the same time with a shorter walk ("oder 115 ab Teltower
Damm, gleiche Ankunft"), where there is one. Measured in S039 (`bench/feeder.ts`): 11 % of trips,
14 min less walking (median), 84 % of them one ride more.

## Build steps only — acceptance criteria
- [ ] Routing: an alternative trip for a journey — the same search with maxInitialWalk, maxFinalWalk
  and maxFallbackWalk capped at 600 s, kept when it arrives at the same second and walks 180+ s less
  at the ends (`alternativeTrip` or similar, next to `laterStart`/`laterChange`); only run when the
  shown trip has an end walk over 600 s. Leaving (nowRun), Ankommen (the reversed timetable) and
  trips between two places (`tripBetween`) alike
- [ ] Worker: the alternative is searched after the trip's message is posted and sent as its own
  message, so tap-to-trip does not wait for it; the card shows it when it arrives and drops it when
  the tap changes
- [ ] Card: one line under the trip, both languages (i18n), with the line, the boarding stop and
  "gleiche Ankunft"; tapping it swaps the card to the ride and offers the walk back the same way
- [ ] Tests: routing (the alternative found, not found when the walk is short, the 180 s rule),
  worker message flow, card rendering
- [ ] `bench/feeder.ts` reports how often the alternative is shown and `bench/suite.ts --vbb`
  still agrees on arrivals; timings at 360×740 (also 4×): tap to trip unchanged, the worker's
  extra time per tap reported

## Notes
- Measured 2026-11-06 (S039): cap 10 min, same arrival; +60 s tolerance buys nothing; 15 min cap
  finds fewer. The pass costs 8 ms in Node (appJourney with the caps).
