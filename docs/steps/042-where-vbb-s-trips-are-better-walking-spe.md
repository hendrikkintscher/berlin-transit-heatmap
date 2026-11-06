---
id: 042
title: Where VBB's trips are better: walking speed, change times, step-free rules
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
Know why VBB's planner finds a trip 3+ min better than the app's, where the app's own data has
none better (the reference search agrees with the app), and decide what to change.

## Decision steps only
- Question: which model differences make VBB's trips better, and which should the app take over?
- Measure: bench/suite.ts (seed 40, from 2026-11-06): VBB 3+ min better on foot 12.3 % of 941, arriving 14.2 % of 183, step-free 24.4 % of 176. Class each case: VBB walks a stretch quicker (walking speed, straight line against streets), changes quicker (station change times), uses a stop or ride the app's step-free rule leaves out, or a trip outside the app's hourly file.
- Results (2026-11-06; bench/vbbwhy.ts, bench/footpaths.ts; not yet decided):

  | Why VBB is 3+ min better (on foot, 116 of 941) | Trips | Median |
  | --- | --- | --- |
  | Change time: the app's footpath (street walk at 5 km/h + 60 s) is longer than VBB's change | 39 | 7 min |
  | Start walk longer than VBB's | 25 | 10 min |
  | Ride not in the app's file (ICE, on-demand "?" buses: not in the VBB GTFS; a few matching misses) | 23 | 8 min |
  | Fits the app model (tolerances; unexplained) | 15 | 5 min |
  | End walk longer | 11 | 5 min |
  | No footpath at all (over the 400 m radius: U Wilmersdorfer Str. ↔ S Charlottenburg) | 3 | 11 min |

  | Footpaths (bench/footpaths.ts) | VBB 3+ min better | App 3+ min earlier than VBB | Trips changed |
  | --- | --- | --- | --- |
  | today | 12.3 % | 23.7 % | – |
  | without the 60 s | 6.5 % | 37.9 % | 30.8 % |
  | capped at 1.3× straight line + 60 s | 7.1 % | 28.5 % | 14.6 % |
  | radius 600 m | 12.0 % | 24.0 % | 1.5 % |

  - The app is already 3+ min earlier than VBB in 23.7 %: 79 of those walk 15+ min at an end where VBB does not, 74 changes/lines (incl. the 120 s same-station cap), 42 VBB lists a later first ride, 27 VBB more rides.
  - Start walks: median 1.35× the straight line, p90 1.9×, but 36 of 773 over 2.5× (up to 9×: 79 m straight, 713 m on foot) — a point snapped to a cut-off path; snapping to several nearby edges would fix the outliers.
  - Step-free (24.4 % VBB better): the build counts a trip step-free only with wheelchair_accessible=1; 14.6 % of the feed's trips are 0 (unknown) — 77 % of regional rail, 31 % of trams, 11 % of buses — so RB24, FEX, Barnim bus C never run in step-free mode. VBB uses them. Policy choice: unknown = usable (as VBB), or keep strict and say so in the app.
  - Ride limit: 7 rides cost nothing on the map search (25 ms), 0.11 % of cells 3+ min earlier; 8 rides +16 % time, 0.21 %.
  - Recommendation draft: cap footpaths at 1.3× straight + 60 s (timetable-build), snap tapped points to several edges, unknown step-free = usable with a note, maxRounds 7. Each its own build step after Hendrik's yes.

## Notes
- S039 covers the same arrival with more walking; this one the arrival itself.
