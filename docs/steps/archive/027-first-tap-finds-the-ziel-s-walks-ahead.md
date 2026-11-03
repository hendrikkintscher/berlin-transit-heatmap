---
id: 027
title: First tap finds the Ziel's walks ahead
type: build
kind: feature
priority: P2
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
On a map to a Ziel leaving, the first tap is about as quick as the later ones: the Ziel's walks
to its stops are found right after the map (S026 / decision 0008), not on the first tap.

## Build steps only — acceptance criteria
- [x] After a map to a Ziel leaving (and again after its footpaths map), the worker finds the Ziel's walks (`originWalks`) once the map, its lines and the other timetable are done, unless a tap or a newer map is already waiting
- [x] First tap at 360×740 about 130 → about 70 ms (GPU-compositing setup, see CLAUDE.md "Speed comes first"); later taps, first map, lines in and footpaths in no slower; also at 4× CPU
- [x] Trips on tap come out the same as before
- [x] Tests cover the new behaviour

## Notes
- Prototype and timings: project files `measure-S026/` (`instrumented-warm.patch`, `timings.txt`).
- Cost accepted in 0008: one 40–70 ms worker pause right after the footpaths map; a ring move in that moment waits.
