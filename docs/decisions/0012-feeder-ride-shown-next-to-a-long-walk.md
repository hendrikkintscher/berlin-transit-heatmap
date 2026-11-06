---
status: accepted
date: 2026-11-06
---

# 0012 — The card shows a feeder ride next to a long walk; the walk stays

## Context

With the same arrival the app's trip on tap walks 3+ min more at the start or end than VBB's
in 10 % of trips (a 21 min walk to S Zehlendorf where VBB takes the 115). The search keeps
the fewest rides; a ride that only saves walking never appears, since RAPTOR records a round
only when it arrives earlier. S039 measured rules "end walks capped at N min, taken when the
arrival stays" on 300 trips (bench/feeder.ts): 10 min / same arrival / saves 3+ min changes
11 % of trips, they walk 14 min less (median), the VBB gap drops to 6 %; the rest is S042.

## Options considered

- **Keep today's trip** — walks up to 30 min count, fewest rides; Hendrik likes walking. No cost.
- **Replace the walk by the ride (rule above)** — what VBB does; takes the walk away; one more
  RAPTOR pass per tap (8 ms in Node).
- **A setting "lieber laufen / fahren"** — same pass when on; default walking; a toggle more.
- **Show both** — the card keeps the walk and adds the ride with the same arrival; same pass,
  only where the end walk is over 10 min (40 % of taps), after the card is up.

## Decision

We chose **show both** because nothing is taken from someone who walks, and the ride is there
on a rainy evening; the pass runs after the card is shown, so the tap is not slower.

## Consequences

- Good: the card says what VBB says without hiding the walk; map and arrival unchanged.
- Bad / accepted cost: about 8 ms of worker time on 40 % of taps; an M step (S045) for the
  card line, the worker message, Ankommen and trips between two places.
