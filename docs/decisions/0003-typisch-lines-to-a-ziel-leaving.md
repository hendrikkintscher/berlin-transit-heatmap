---
status: accepted
date: 2026-11-03
---

# 0003 — Typisch lines on a map to a Ziel leaving: each stop's trips by their share of the hour

## Context

Under Typisch, a map to a Ziel with a time to leave averages each place over the hour and takes no
one trip, so its lines came from a separate pass arriving 40 minutes after the hour starts. Those
lines held only about half of what the trips on tap ride. Step: S002.

## Options considered

Measured on 5 Ziele × 300 random places (`packages/routing/bench/typlines.ts`), weekday 10 Uhr:

| Lines from                                            | hops drawn | tap trips' hops on them | tap trips wholly on them | drawn lines ridden by a tap | map + lines (Node) |
| ----------------------------------------------------- | ---------- | ----------------------- | ------------------------ | --------------------------- | ------------------ |
| a pass arriving 40 min on (before)                    | 903        | 57 %                    | 24 %                     | 81 %                        | –                  |
| the same pass 50–70 min on                            | 1178–1430  | 61–62 %                 | 29–31 %                  | 75–81 %                     | +0                 |
| each stop's cells over its trips by share of the hour | 856        | 67 %                    | 34 %                     | 93 %                        | +10 ms             |
| each cell's trips over the hour (with its own walk)   | 1239       | 70 %                    | 38 %                     | 86 %                        | +110 ms            |
| each stop's trip serving the most of the hour         | 1746       | 72 %                    | 42 %                     | 78 %                        | +35 ms             |
| the vehicle caught leaving on the hour                | 1243       | 71 %                    | 39 %                     | 86 %                        | +40 ms             |

## Decision

Hendrik chose **each stop's cells over its trips by share of the hour** (`goalShares`): fewer lines,
more of the tap trips on them, and nearly all drawn lines really ridden.

## Consequences

- Good: the lines follow the trips people take; the extra pass for the lines is gone.
- Accepted cost: only Typisch maps to a Ziel leaving, about +10 ms in Node (the profile keeps its
  legs, then goalUsage); every other map and every tap unchanged.
