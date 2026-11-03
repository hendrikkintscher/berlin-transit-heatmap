---
id: 019
title: Places layer
type: build
kind: feature
priority: P3
size: M
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The map answers "Wohin jetzt?": lakes, pools, parks and similar places shown with their minutes.

## Acceptance criteria
- [ ] A places layer shows such places with their minutes from the start
- [ ] Timings at 360×740 (also with the page CPU slowed 4×) unchanged against main, reported in the PR

## Notes
- Planned as 0.15.9 (design list D4).
