---
status: accepted
date: 2026-11-03
---

# 0005 — A long first walk taken over a short ride to the same train stays as it is

## Context

From Alexanderplatz, trips to places past Bernau can start with 24–35 min on foot to Friedrichstr.
or Gesundbrunnen instead of a few stops on the S3/U8 first. Step: S025.

## Options considered

Measured on 3 starts × 150 random places, two seeds, weekday 10 Uhr, walks up to 30 min at both ends
(project files `measure-S025/ridewalk.ts`): an end walk over 20 min, and a trip with that walk kept
to 15 min arriving as early.

| trips                    | first walk > 20 min | a ride arrives as early | in Berlin | walk saved (median / max) | extra rides |
| ------------------------ | ------------------- | ----------------------- | --------- | ------------------------- | ----------- |
| Nächste map (669)        | 15 (2.2 %)          | 15                      | 1         | 22–32 / 33 min            | 1           |
| trip on tap (1327)       | 45 (3.4 %)          | 45                      | 6         | 22 / 32 min               | 1           |
| last walk > 20 min (all) | 630                 | 3                       | 2         | –                         | 0           |

It is the fewest-rides choice: the trip ends on an hourly bus, so riding first only means waiting
longer for the same bus, and a tie on arrival keeps the trip with fewer rides. Long last walks are
the place being far from any stop; a ride does not help there.

- **Leave as is**: map, card and lines keep agreeing; costs nothing.
- **Prefer the ride on tap** when the first walk is over 20 min and one more ride arrives as early:
  two more searches on those taps (+2–3 ms, ×4 on a slow phone), and the card parts from the map's lines.
- **Prefer less walking in every search** (tie-break in the search): touches the first map's inner loop.

## Decision

**Leave as is** (a minor call, under Hendrik's rule of 2026-11-03 to decide minor things): rare,
nearly all outside Berlin, the walk shown is real and timed, and every fix slows taps or the map.

## Consequences

- Good: nothing changes, nothing slows.
- Accepted cost: about 1 in 30 trips from a central station to beyond the city edge starts with a
  20–35 min walk where a short ride and a longer wait would do.
