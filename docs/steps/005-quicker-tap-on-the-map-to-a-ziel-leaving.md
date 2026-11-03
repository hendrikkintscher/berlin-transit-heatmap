---
id: 005
title: Quicker tap on the map to a Ziel leaving
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
The tap on the map to a Ziel leaving is as quick as the arrival map's tap.

## Decision
- Question: Can the latest leaving (the tap's second search) be read off the map's profile search?
- Measure: How much of the tap that saves in Node and in the browser at 360×740 (also with the page CPU slowed 4×), with the trips unchanged.
- Results: <table and one-line recommendation once measured; nothing changes without Hendrik's yes>

## Notes
- Planned as 0.13.19. Note from 0.13.12 (2026-10-16): that tap takes about twice the arrival map's in Node (5–8 against 3–4 ms: three searches against one); in the browser 195 against about 175 ms.
