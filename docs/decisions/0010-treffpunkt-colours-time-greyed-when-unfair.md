---
status: accepted
date: 2026-11-03
---

# 0010 — Treffpunkt colours: the group's time, greyed out where it is unfair

## Context

The meeting map showed only the slowest person's minutes over the best spot, in the app's usual
scale, so it looked like any other map and said nothing about fairness (step S016). Five codings
were prototyped on the same meeting (Pankow + Steglitz, Mo–Fr ab 10 Uhr) at 360×740 (project
files `measure-S016/`: `looks.mjs`, `time.mjs`, `looks-compare.png`, `look-3-new.png`). Worker
cost per meeting map (paint + lines, real 10 Uhr data, median of 11; maps with one start are
untouched):

| look                                    | worker per meeting map |
| --------------------------------------- | ---------------------- |
| today: slowest over the best spot       | 238 ms                 |
| 1: two colours (3×3 time × fairness)    | +88 ms                 |
| 2: hatching from a 15 min gap           | +135 ms                |
| 3: greying from an 8 to a 20 min gap    | +215 ms                |
| 4: one score (slowest + Ø, as the pins) | +69 ms                 |
| 5: dashed lines at a 10 and 20 min gap  | +141 ms                |

In the browser the differences stayed inside the noise (first map 2.1–2.4 s at 1×, 2.7–3.3 s at
4× page CPU; tap → trip 0.8–1.1 s).

## Options considered

- **1 two colours**: both dimensions at once, but blocky and hard to read on a phone.
- **2 hatching**: unfair places stand out, but busy over lines and base map.
- **3 greying**: colour stays "how long for the group", unfair places wash out; calm.
- **4 one score**: cheapest and smooth, but the number means nothing to a reader.
- **5 gap lines**: exact minutes of unfairness, but clash with the time lines.
- **Leave as is**: no fairness on the map.

## Decision

**Look 3** (Hendrik, 2026-11-03), with his changes: the legend says **"unfair"** (not "ungleich"),
and the meeting map gets its own scale of Ø minutes over the best place: green at +0, **yellow
at +5, red at +15**, purple at +25, dark blue from +40. Places fade to grey from an 8 to a 20
minute gap between the slowest and the quickest person. Built in S017.

## Consequences

- Good: the meeting map shows both the group's time and fairness, and looks unlike the
  single-start map.
- Accepted cost: about +0.2 s worker time per meeting map (more on a slow phone); S017 should
  blur the gap at half resolution to win about half of it back and report the timings.
