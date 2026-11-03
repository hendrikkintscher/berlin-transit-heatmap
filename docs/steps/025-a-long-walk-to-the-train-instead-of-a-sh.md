---
id: 025
title: A long walk to the train instead of a short ride to it
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
Know why a trip can start with a long walk to a station a short ride away (Alexanderplatz to places
past Bernau: 35 min on foot to Friedrichstr. for the S2), and whether a short ride should win.

## Decision
- Question: Is this the fewest-rides choice taking a long walk over one more short ride, and should the trip prefer the ride?
- Measure: how often a trip's first or last walk could be replaced by a ride of a few stops arriving as early, over random places; what changing it costs a tap.
- Results: <table and one-line recommendation once measured>

## Notes
- Seen during S004 (2026-11-03) on the Nächste map's trips from Alexanderplatz, weekday 10 Uhr (measure-S004/longwalk.ts in the project files).
