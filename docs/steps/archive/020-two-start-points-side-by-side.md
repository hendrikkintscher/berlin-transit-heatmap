---
id: 020
title: Two start points side by side
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
Two start points' maps can be compared side by side (flat hunting).

## Acceptance criteria
- [ ] Two start points can be compared on one screen
- [ ] Timings at 360×740 (also with the page CPU slowed 4×) unchanged against main, reported in the PR

## Notes
- Planned as 0.15.10 (design list D5).
- Moved to docs/specs/later.md, not built (2026-11-05): Lieblingsorte (minutes and Ø per start) and the
  Wohnlage map already answer flat hunting; side by side at 360 px means two 180 px maps and twice the
  routing on every change. Hendrik had put it before 1.0 (CHANGELOG V1.35) and can pull it back.
