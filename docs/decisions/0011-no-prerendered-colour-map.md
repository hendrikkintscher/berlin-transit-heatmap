---
status: accepted
date: 2026-11-05
---

# 0011 — No prerendered colour map on a fresh start

## Context

S033 asked whether a fresh start should show a colour map that ships ready-made, so colours
appear without waiting for the timetable and the worker (Hendrik, 2026-11-03). Since S014 (0.15.8)
a visit without a start already opens on the computed map from Alexanderplatz: colours at about
1.3–1.5 s (1×) and 1.6–1.9 s (4× page CPU) at 360×740, with the start card up at 0.3 s / 0.85 s.
A prerendered fill could only win that gap, mostly under the start card, on first visits.

## Options considered

- **Prerendered fill per hour** — colours up to about 1 s sooner on a first visit; needs a nightly
  paint of about 240 hour files (48 typical hours, 8 dates × 24), an extra download that competes
  with the timetable and stop list (and can delay the real map), and images that go stale.
- **Keep the computed example map (S014)** — no new pipeline or download; colours as they are.

## Decision

We keep the computed example map because the most a prerendered fill could gain (about 1 s, on
first visits only) does not pay for a nightly paint pipeline and a download that competes with
the real map. Decided by Claude, to whom Hendrik handed the finishing of the app (2026-11-05).
Step: S033.

## Consequences

- Good: no new files, downloads or pipeline; the first map stays on its measured path.
- Bad / accepted cost: a first visit waits about 1.3–1.5 s for colours, as today.
