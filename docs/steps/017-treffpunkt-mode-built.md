---
id: 017
title: Treffpunkt mode built
type: build
kind: feature
priority: P2
size: M
needs: S016
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The look Hendrik picks in S016 becomes the meeting map.

## Acceptance criteria
- [ ] The meeting map uses the chosen colour coding
- [ ] The home-screen Treffpunkt button goes and "+ Person" matches the drawer
- [ ] There is still a direct way to start a meeting with someone new (today the floating button brings back the closed person until all starts are cleared)

## Notes
- Decided in S016 (decision 0010): look 3. Colour = Ø minutes over the best place in the meeting
  map's own scale (green +0, yellow +5, red +15, purple +25, dark blue +40); places fade to
  grey from an 8 to a 20 min gap between slowest and quickest; legend says "unfair (15+ Min.
  Unterschied)". Prototype: local branch `proto-s016`, `packages/web/src/meet-look.ts` (look 3);
  screens in `/mnt/project-files/measure-S016/` (`look-3-new.png`). Blur the gap at half
  resolution to halve the +215 ms worker cost.
- Planned as 0.15.7 (design list D10). Side note from 0.12.0 (2026-10-14) on the floating button.
