---
id: 037
title: Trip card times match the minutes (Ring trip change, overtaking trips)
type: build
kind: fix
priority: P1
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Every ride on the trip card shows the vehicle the trip really takes, so the card's times agree
with its arrival (the map's minutes). Found by S036: 8 of 294 random trips showed wrong times.

## Build steps only — acceptance criteria
- [x] A ride that changes trips on the way (the Ring at Beusselstr., one leg from journeyVia) is timed across the change, not past the end of its first trip's row (rideClocks in web/src/worker-trips.ts; S036 #89: S41 "19:25–18:51")
- [x] The card's rides take the vehicle the search rode (S036 #235: the card showed the 17:02 bus and the 17:33 S2 although the arrival needs the 17:13 one). Cause: two 893 buses with a change between them were merged into one ride; now a line is merged only where its trip ends, so the card says to change buses
- [x] `bench/providers.ts` shows no clock mismatch on its 300 trips (seed 36)
- [x] Tests cover the new behaviour

## Notes
- Merged rides keep their `parts`; `rideTimes` (routing/src/journey.ts) times them, used by the card and the drawer.
