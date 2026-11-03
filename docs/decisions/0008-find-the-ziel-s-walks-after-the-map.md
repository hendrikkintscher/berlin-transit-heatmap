---
status: accepted
date: 2026-11-03
---

# 0008 — Find the Ziel's walks right after the map, not on the first tap

## Context

S005 measured about 110 ms from a tap to the worker's trip on a map to a Ziel leaving, while the
searches take about 8 ms in Node. Step: S026. Map to Alexanderplatz leaving (Typisch), 360×740,
fresh visits, footpaths in before tapping; each part timed inside the worker (project files
`measure-S026/`: `tap.mjs`, `instrumented-warm.patch`, `timings.txt`).

The ~110 ms was mostly the test setup. Plain headless Chromium composites in software and copies
the WebGL map back every frame (`GLES2::ReadPixels`, about 75 ms on the page's main thread), and
the trip message waits behind it. Started with
`--ignore-gpu-blocklist --enable-gpu-compositing --use-angle=swiftshader --enable-unsafe-swiftshader`
(as on a phone, no copy back) the split is:

| part of a tap                           | later taps           | first tap  |
| --------------------------------------- | -------------------- | ---------- |
| searches in the worker                  | 35 ms (19 once warm) | 123 ms     |
| …of which the Ziel's walks to its stops | 0 (kept)             | 68 ms      |
| footpath lines, stop names, message     | under 1 ms           | ~5 ms      |
| worker → page, card shown               | 3–4 ms               | 4 ms       |
| **tap → card**                          | **57 ms**            | **133 ms** |

The searches are slower than in Node because the worker's code is still cold after a few taps
(after 18 taps: 19 ms).

## Options considered

- **Leave as is**: nothing changes; the first tap stays about twice as slow as the rest.
- **Find the Ziel's walks after the map** (prototype): first tap 133 → 68 ms (4× CPU: 180 → 136),
  later taps the same. Costs one 40–70 ms worker pause right after the footpaths map (the first,
  straight-walk map: 1–7 ms); a ring move or map move in that moment waits.

## Decision

**Find the Ziel's walks after the map**, as its own build step S027 (Hendrik, 2026-11-03): the
first tap gets twice as fast, and the pause comes once, while the new map is being looked at; a
tap then would have paid it anyway.

## Consequences

- Good: the first tap on a map to a Ziel leaving is about as quick as the later ones.
- Accepted cost: one 40–70 ms worker pause after the footpaths map.
- Browser timings of taps now use the GPU-compositing flags (CLAUDE.md, "Speed comes first");
  earlier tap→trip numbers (S001–S005) include the ~60–75 ms copy-back stall.
