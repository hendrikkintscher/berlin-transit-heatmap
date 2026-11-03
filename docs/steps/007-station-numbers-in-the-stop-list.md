---
id: 007
title: Station numbers in the stop list
type: build
kind: refactor
priority: P3
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
One file fewer per visit: the live status's station numbers ride in `stoplist.bin`.

## Acceptance criteria
- [ ] The timetable build writes the station numbers into `stoplist.bin`; the live status reads them from there, and `stop-ids.json` goes
- [ ] The stop list's size before and after (gzipped) is reported
- [ ] First map timings stay the same; tests cover the new field

## Notes
- Planned as 0.13.22. Note from 0.13.13 (2026-10-16).
