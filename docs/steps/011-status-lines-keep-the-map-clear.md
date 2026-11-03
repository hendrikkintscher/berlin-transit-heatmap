---
id: 011
title: Status lines keep the map clear
type: build
kind: fix
priority: P2
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
No status line covers the map for long.

## Acceptance criteria
- [ ] Every status line, where it sits and how long it can stay, is listed
- [ ] Any that can stay over the map strip for more than about 5 s moves or shortens; the rest stay

## Notes
- Planned as 0.15.1 (design list D8). Noted after 0.10.10: the footpath loading line covers the strip between the tip card and the bottom buttons (y 661–680 at 360×740).
