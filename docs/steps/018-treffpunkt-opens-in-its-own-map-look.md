---
id: 018
title: Treffpunkt opens in its own map look
type: build
kind: feature
priority: P2
size: S
needs: S017
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Starting Treffpunkt switches the map to the meeting colouring; closing it returns to the look that was on before.

## Acceptance criteria
- [ ] Treffpunkt opens in the colouring built in S017 and closes back to the previous look
- [ ] One repaint, no extra routing on the switch

## Notes
- Planned as 0.15.8 (design list D11). Hendrik (2026-10-14): "when Treffpunkt mode is started change map style to it's specific heatmap mode".
