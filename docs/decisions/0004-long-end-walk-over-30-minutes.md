---
status: accepted
date: 2026-11-03
---

# 0004 — A walk on the card a few minutes over the 30-minute rule stays as it is

## Context

The trip on tap can show an end walk over 30 minutes (Alexanderplatz to 52.489, 13.229: 33 min
from S Grunewald), though walks count only up to 30 (`FASTEST_WALK`). Step: S004.

## Options considered

Measured on 3 starts × 150 random places, weekday 10 Uhr (Nächste map trips and trips on tap):

| walk speed | trips | end walk > 30 min | over by (median / max) | straight walk from the ride's stop also > 30 |
| ---------- | ----- | ----------------- | ---------------------- | -------------------------------------------- |
| 4 km/h     | 996   | 9 (0.9 %)         | 4.9 / 10.5 min         | 9 of 9                                       |
| 5 km/h     | 1116  | 12 (1.1 %)        | 4.3 / 7.8 min          | 12 of 12                                     |

The ride ends at a stop over 30 minutes away; the search changes on foot to another stop of the
same station just inside 30 minutes, and the card merges that change into the walk.

- **Leave as is**: the card shows the walk the trip times; rare, nearly all beyond the city edge.
- **Count the change against the 30 minutes**: these places lose the trip or get a worse one.
- **Show the straight walk from the ride's stop** (1–3 min shorter): the card then parts from the map.

## Decision

**Leave as is** (a minor call, made under Hendrik's rule of 2026-11-03 to decide minor things).

## Consequences

- Good: nothing changes; card, map and trip times keep agreeing.
- Accepted cost: about 1 in 100 random places shows a walk up to 10 minutes over 30, with the 0.13.17 hint.
