---
id: 008
title: Footpaths sooner on a slow line
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
On a slow line, trips on tap use real footpaths sooner after the first map.

## Decision
- Question: Is a smaller footpath file, or loading the part around the start first, worth it?
- Measure: What a smaller footpath file (fewer or coarser footpaths, a tighter encoding) or loading the part around the start first would save on a 5 and a 20 Mbit/s line, and what it costs the first map and the taps at 360×740 (also with the page CPU slowed 4×).
- Results: <table and one-line recommendation once measured; nothing changes without Hendrik's yes>

## Notes
- Planned as 0.13.24. Note from 0.13.15 (2026-11-02): on 5 Mbit/s the footpaths are in 7–8 s after the first map (`walk.bin` is 3.5 MB), so trips on tap until then use straight-line walks.
