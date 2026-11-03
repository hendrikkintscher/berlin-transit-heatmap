---
id: 033
title: Prerendered colour map on a fresh start (a default place such as Alexanderplatz)
type: decision
kind: research
priority: P3
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
A fresh start opens on a map with its colours at once, without waiting for the timetable and
the worker: a default place and view whose colour map ships ready-made (Hendrik, 2026-11-03).

## Decision steps only
- Question: is a default start (today a fresh start has no map until a tap) with a
  prerendered fill worth it, and how is it kept true to the day and hour?
- Measure: image size per hour file (48) and per day type, download added to a fresh start,
  time to colours on screen at 360×740 and 4× CPU against the computed map (S013 timings).
- Results: (to come)

## Notes
- Came up during S013 (fill on by default). Needs a build-time paint (pipeline) and a default
  place for first-time visitors, so it is its own step.
- S014 (0.15.8) now opens a visit without a start on the computed map from Alexanderplatz
  (fresh visit, 360×740, blank basemap): colours at about 1.3–1.5 s (1×) and 1.6–1.9 s (4×),
  with the start card up at 0.3 s / 0.85 s. A prerendered fill could only win that gap.
