---
id: 040
title: Route quality suite: feasibility, reference optimality, all modes
type: build
kind: chore
priority: P1
size: M
needs: S036
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Know whether the routing works well, with written targets a later change is tested against:
real trips, the fastest on the app's own data, close to VBB's, sensible among equal ones, and the
map, card and drawer in agreement, in every mode.

## Build steps only — acceptance criteria
- [ ] Feasibility: each trip replayed against the raw GTFS by an independent reader (vehicles exist at those times, changes leave enough time, walks plausible); target 0 failures
- [ ] Optimality: a simple reference search on the real timetable for a sample of trips; target 0 trips where it is faster (ties fine)
- [ ] `providers.ts` modes: Ankommen, bike + train, step-free, night (0–5 h); a typical-day check against the reference only
- [ ] A 1,000-trip run split by time of day, weekday/weekend, distance and inner city/edge; results and targets in the PR (vs VBB 3+ min later < 5 %, stay-on 0, same arrival with 3+ min more walking < 3 %, clock mismatches 0)
- [ ] Feasibility and optimality run offline in CI on a small fixed sample
- [ ] Tests cover the new behaviour

## Notes
- Sample size: ~460 trips measure a 5 % rate to ±2 points; ~600 see a 1-in-200 bug with 95 %.
- Google as a third planner only if Hendrik makes a key (Routes API; cache only arrival times).
