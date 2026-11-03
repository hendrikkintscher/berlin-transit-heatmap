---
id: 026
title: Where a tap's time goes in the browser
type: decision
kind: research
priority: P2
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Know which parts of the worker's answer to a tap take its time in the browser, and whether any can go quicker without changing the trip.

## Decision
- Question: Where do the ~110 ms between posting a tap to the worker and its trip answer go (360×740, map to Alexanderplatz leaving), when the searches take ~8 ms in Node?
- Measure: Time each part of the tap in the worker (searches, footpath drawing, stop names, message) at 360×740, also with the page CPU slowed 4×; list what could be cut and what it would save.
- Results (2026-11-03, decision 0008): the ~110 ms was mostly the test browser. Plain headless Chromium composites in software and copies the WebGL map back each frame (~75 ms on the page's thread); the trip waits behind it. With GPU compositing: tap→card 57 ms (worker searches 35, 19 once warmed up; footpath lines, stop names and the message under 1 ms). First tap 133 ms, 68 of it the Ziel's walks to its stops. Finding those after the map: first tap 68 ms (4×: 180 → 136), one 40–70 ms worker pause after the footpaths map. Hendrik: yes, as its own step (S027).

## Notes
- Found in S005 (2026-11-03): one search less per tap saved 1–2.5 ms in Node but did not show in the browser (`/mnt/project-files/measure-S005/goal.mjs` times the worker's answer).
