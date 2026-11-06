---
id: 041
title: Map minutes: a nearer stop reached later is not blocked by a farther one
type: build
kind: fix
priority: P1
size: S
needs: S040
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Every place gets the minutes of its best stop. Found by the route quality suite (S040): the
reference search is 10 min quicker to a place in Falkensee (weekday 10:26 from Savignyplatz,
11:39 instead of 11:49), and the map's own grid from that one stop gives 11:39 too.

## Build steps only — acceptance criteria
- [ ] Cause fixed: walkFrom (routing/src/walk.ts) spreads all stops' walks at once with one label per street node and a 2.5 km walk cap. A stop reached earlier but farther away (Goldkäferweg, 11:20) labels the streets first; a nearer stop reached later (Falkensee, Humboldtallee, 11:25) cannot pass them, and once the first walk reaches the cap the places behind get a detour
- [ ] `bench/suite.ts`: reference 1+ min quicker 0 on its runs; the CI sample's allowance (TODO(S041) in suite.ts) back to 0
- [ ] First map timings at 360×740 (also 4×) and the CI speed job no slower
- [ ] Tests cover the new behaviour

## Notes
- A second label per node only where the walk is shorter (or relaxing a capped node again) keeps it exact; measure the cost on the first map before choosing.
