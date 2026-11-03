---
id: 006
title: More hours kept offline
type: build
kind: feature
priority: P2
size: XS
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The service worker keeps up to 48 hourly files: more hours and days offline, fewer downloads in the Zeit panel.

## Acceptance criteria
- [ ] The service worker's limit for hourly files is raised (for example to 48), oldest out first; nothing extra is downloaded ahead
- [ ] Stored size after a day of use is reported, and the Zeit panel's hours come from the cache
- [ ] First visit and tap timings unchanged

## Notes
- Planned as 0.13.21. Note from 0.13.13 (2026-10-16): hourly files are now 40–60 KB gzipped, so 48 would be about 2.5 MB.
