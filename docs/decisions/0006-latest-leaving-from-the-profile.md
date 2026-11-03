---
status: accepted
date: 2026-11-03
---

# 0006 — Tap on a map to a Ziel leaving: the latest leaving read off the map's profile

## Context

A tap on a map to a Ziel with a time to leave ran three searches (arrival leaving then, latest
leaving still arriving then, the trip from that moment), against the arriving map's one: about
twice its time in Node. The map's own profile search from the Ziel already holds, per stop, the
latest leaving for every arrival. Step: S005.

## Options considered

Measured on 3 Ziele × 300 random places, weekday 10 Uhr, leaving 10:57 (`packages/routing/bench/latest.ts`):

| Tap (Node, per tap)  | Alexanderplatz | Spandau Rathaus | Köpenick       | same trip  |
| -------------------- | -------------- | --------------- | -------------- | ---------- |
| three searches today | 7.7 ms         | 10.6 ms         | 10.3 ms        | –          |
| Nächste's profile    | 6.7 ms (−13 %) | 8.1 ms (−24 %)  | 8.6 ms (−16 %) | 899 of 899 |
| Typisch/Bestfall's   | 7.3 ms (−5 %)  | 9.7 ms (−9 %)   | 9.2 ms (−11 %) | 899 of 899 |
| arriving map's tap   | 4.0 ms         | 4.7 ms          | 6.1 ms         | –          |

The profile's latest leaving counts any number of rides; where the trip with the fewest rides
leaves earlier (17–44 % of places with Nächste's profile, 38–72 % with the hour's), the trip from the read-off moment does not
arrive in time with that many rides and the search runs as before, one search dearer.

## Decision

Claude decided (Hendrik's standing instruction for minor decisions, 2026-11-03): **read it off the
profile, checked by the trip from then** (`toProfile` in tripBetween). Trips stay the same; the
tap is quicker or as quick in every case measured.

## Consequences

- Good: the tap does one search less where the read-off holds; nothing else changes.
- Accepted: where it does not hold, one wasted search (still quicker overall); the tap stays
  above the arriving map's, because its first search remains.
