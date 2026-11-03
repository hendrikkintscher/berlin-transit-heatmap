---
id: 004
title: Long walk on the trip card over the 30-minute walk rule
type: decision
kind: research
priority: P3
size: S
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Know why a walk at an end of the trip on tap can come out over the 30 minutes of the walk rule, and whether to fix it.

## Decision
- Question: Where do the extra minutes come from (the cell against the tapped point, or the fallback walk), and is a fix worth it?
- Measure: Alexanderplatz to the Grunewald place 52.489, 13.229 walks 33 minutes from S Grunewald; check that case and how often it happens over random places.
- Results (2026-11-03, weekday 10 Uhr, 3 starts × 150 random places, Nächste map trips and trips on tap at 10:00/10:30; script in the project files, measure-S004/longwalk.ts):

  | walk speed | trips | an end walk > 15 min | > 30 min | over by (median / max) | straight from the ride's stop also > 30 |
  | ---------- | ----- | -------------------- | -------- | ---------------------- | --------------------------------------- |
  | 4 km/h     | 996   | 523                  | 9 (0.9 %) | 4.9 / 10.5 min        | 9 of 9                                  |
  | 5 km/h     | 1116  | 612                  | 12 (1.1 %, 6 of them the Grunewald place) | 4.3 / 7.8 min | 12 of 12                 |

  Cause: neither the cell nor the fallback walk. The ride ends at a stop more than 30 minutes' walk away (S Grunewald's S7 platform: 30.4 min at 5 km/h); the search changes on foot to another stop of the same station that is just inside 30 minutes (a bus stop, 28.9 min) and the card merges that change into the end walk (32.6 min; Hendrik saw 33). Same at the start end. Almost all cases are beyond the city edge.
  Decision (minor, made in the thread under Hendrik's 2026-11-03 rule): leave as is. The walk on the card is the one the trip times; counting the change against the 30 minutes would drop these trips, showing the straight walk would part the card from the map's minutes. Decision 0004.

## Notes
- Inbox note from 0.13.17 (2026-11-03). Walk rule: `FASTEST_WALK` in `packages/web/src/worker-runs.ts`.
