---
id: 012
title: Ring widths show their order
type: build
kind: feature
priority: P3
size: XS
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The rings show their order at a glance.

## Acceptance criteria
- [x] Each ring gets its own line width, so the look-alike pairs (15/30 near-black, 45/60 mid-purple) are told apart without their labels
- [x] One repaint, no extra routing

## Notes
- Planned as 0.15.2 (design list D7). Noted after 0.11.0.
