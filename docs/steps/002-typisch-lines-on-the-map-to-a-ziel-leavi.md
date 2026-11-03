---
id: 002
title: Typisch lines on the map to a Ziel leaving
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
Under Typisch, the lines of the map to a Ziel leaving follow the trips people would take.

## Decision
- Question: Should those lines come from the cells' most common trips instead of a pass arriving 40 minutes on?
- Measure: How far today's lines are from the lines of the trips on tap over random places, and what lines from the cells' most common trips would cost per map.
- Results: <table and one-line recommendation once measured; nothing changes without Hendrik's yes>

## Notes
- Planned as 0.13.20. Note from 0.13.12 (2026-10-16): Typisch cells average the hour and take no one trip; Nächste and Bestfall follow the cells' own trips since 0.13.12.
