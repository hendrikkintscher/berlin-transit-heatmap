---
id: 014
title: Example map on the first screen
type: build
kind: feature
priority: P3
size: M
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The first screen shows a finished, coloured example map (for example from Alexanderplatz) before any tap.

## Acceptance criteria
- [x] The example map shows before any tap
- [x] It does not delay the first real map (timed at 360×740, also with the page CPU slowed 4×)

## Notes
- Planned as 0.15.4 (design list D1).
