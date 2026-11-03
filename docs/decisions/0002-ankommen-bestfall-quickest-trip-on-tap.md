---
status: accepted
date: 2026-11-03
---

# 0002 — Ankommen under Bestfall: the trip on tap is the map's quickest trip of the hour

## Context

Arriving under Bestfall, the map shows each place's quickest trip arriving within the hour, but the
trip on tap arrived by the hour's end (0.13.11), so it was 3+ minutes off the map for about half the
places. Step: S001.

## Options considered

Measured on 390 places to 3 Ziele (`packages/routing/bench/arriveslots.ts`), arriving 11–12 Uhr:

| Trip on tap arrives by                                                     | within 1 min of map | 3+ min apart      | tap (Node)     |
| -------------------------------------------------------------------------- | ------------------- | ----------------- | -------------- |
| end of the hour (before)                                                   | 45–49 %             | 48–51 %           | 2.5 ms         |
| quickest of 2 / 3 / 6 slots of the hour                                    | 63 / 65–72 / 85 %   | 33 / 25–32 / 12 % | 9 / 15 / 33 ms |
| the cell's quickest trip (map pass keeps when each stop's quickest leaves) | 90–92 %             | 6–8 %             | 6.5 ms         |

## Decision

Hendrik chose **the cell's quickest trip**: the closest to the map, with one search per tap.

## Consequences

- Good: the card and the map agree within a minute for about 90 % of places (before about 45 %).
- Accepted cost: a tap does its own search: in the browser about +4–9 ms per tap, first tap +7–13 ms.
