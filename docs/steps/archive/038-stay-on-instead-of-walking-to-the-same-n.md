---
id: 038
title: Stay on instead of walking to the same next vehicle
type: build
kind: fix
priority: P1
size: S
needs: S036
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
The trip on tap stays on a vehicle instead of getting off a stop early to walk to the same next
vehicle (Hendrik, 2026-11-05). Arrival and the map's minutes stay as they are.

## Build steps only — acceptance criteria
- [x] Changing later: a ride goes on to a later stop where the same next vehicle can be caught with 2+ min less walking (S036: 12 of 294 trips, 4 %; e.g. off the M4 at Antonplatz, 10 min walk to the 255, when the M4 meets the same 255 at Weißer See)
- [x] The last ride: measured, left as it is. The 4 of 294 S036 found are within 1 min either way (2 arrive a minute earlier, 2 later), which is the difference between the walk to the exact point and the app's walk to its 50 m cell; changing them would part the card from the map's minutes
- [x] `bench/providers.ts` (seed 36) finds no early change (5 → 0, with the timetable's own footpaths); first map and tap-to-trip timings unchanged
- [x] Tests cover the new behaviour

## Notes
- Cause: RAPTOR boards a route at the first stop where the trip can be caught; reaching it on foot
  ties with staying on, and the tie goes to the walk. A pass over the found journey (like laterStart)
  can redo the transfer without touching the search; bench/quality.ts stayOn / stayOnTransfer find them.
