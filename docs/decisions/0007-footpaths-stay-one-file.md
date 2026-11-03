---
status: accepted
date: 2026-11-03
---

# 0007 — The footpaths stay one file, as they are

## Context

On a slow line, trips on tap use straight-line walks until the footpaths (`walk.bin`) are in.
The note from 0.13.15 said 7–8 s after the first map at 5 Mbit/s; that setup served `walk.bin`
unzipped (3.56 MB). Pages serves it gzip: 2.09 MB on the wire. Step: S008.

## Options considered

`walk.bin` (546 k nodes, 792 k edges) is already column-encoded and in Morton order with nodes
at least every 100 m. Sizes are gzip level 9. Browser: fresh visits at 360×740, a shared line
with 40 ms RTT, every file served gzip, blank base map, medians of 6 (project files
`measure-S008/footpaths.mjs`, `timings.txt`). "Footpaths in" is counted from the first map.

| option                                 | gzip    | 5 Mbit/s 1×           | 5 Mbit/s 4× | 20 Mbit/s 1× | 20 Mbit/s 4× | walks                         |
| -------------------------------------- | ------- | --------------------- | ----------- | ------------ | ------------ | ----------------------------- |
| today                                  | 2.09 MB | 5.0 s                 | 6.9 s       | 2.2 s        | 2.8 s        | –                             |
| Hilbert order instead of Morton        | −1.7 %  | –                     | –           | –            | –            | same                          |
| nodes every 200 m                      | −8.7 %  | –                     | –           | –            | –            | p95 point→node 46 → 52 m      |
| nodes every 300 m                      | −15 %   | 4.5 s                 | 7.0 s       | 2.1 s        | 2.6 s        | p95 point→node 46 → 69 m      |
| start's area first (5 km ≈ 10 % nodes) | ~0.2 MB | ~0.5 s near the start | –           | –            | –            | tiled file, per-tile snapping |

First map and tap→trip did not move with the smaller file (first map 2.7 s / 1.4 s, tap→trip
0.16–0.35 s). The 4× times are bound by the unpacking and snapping (about 1–2 s), not the line.

- **Leave as is**: nothing changes, nothing slows.
- **Coarser footpaths (300 m)**: 0.5 s sooner on a 5 Mbit/s line, nothing on a slow phone; walks
  start and end up to ~70 m from the real point more often.
- **Start's area first**: a tiled `walk.bin`, snapping per tile and a second map redo; an M-sized
  rebuild that helps only taps near the start (a tapped place far off still needs its own tile),
  and the full map still waits for the whole file.

## Decision

**Leave as is** (a minor call, under Hendrik's rule of 2026-11-03 to decide minor things): the
file is close to as small as it gets, the only cheap cut saves half a second on slow lines only and
costs walk accuracy, and start-first loading is a large rebuild for a partial gain.

## Consequences

- Good: nothing changes, nothing slows; the real wait at 5 Mbit/s is about 5 s, not 7–8 s.
- Accepted cost: on a 5 Mbit/s line, taps in the first ~5 s after the map use straight-line walks.
