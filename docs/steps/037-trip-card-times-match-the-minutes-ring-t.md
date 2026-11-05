---
id: 037
title: Trip card times match the minutes (Ring trip change, overtaking trips)
type: build
kind: fix
priority: P1
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Every ride on the trip card shows the vehicle the trip really takes, so the card's times agree
with its arrival (the map's minutes). Found by S036: 8 of 294 random trips showed wrong times.

## Build steps only — acceptance criteria
- [ ] A ride that changes trips on the way (the Ring at Beusselstr., one leg from journeyVia) is timed across the change, not past the end of its first trip's row (rideClocks in web/src/worker-trips.ts; S036 #89: S41 "19:25–18:51")
- [ ] The card's rides take the vehicle the search rode, also on another route of the same line (twins, as the drawer already does; S036 #235: the card shows the 17:02 bus and the 17:33 S2 although the arrival needs the 17:13 one)
- [ ] `bench/providers.ts` shows no clock mismatch on its 300 trips (seed 36)
- [ ] Tests cover the new behaviour

## Notes
- bench/quality.ts rideTimes already follows the trip change; the fix can move it into routing/src/journey.ts.
