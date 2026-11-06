---
id: 045
title: Trip card: the feeder ride next to a long walk, same arrival
type: build
kind: feature
priority: P2
size: M
needs: S039
status: doing
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Decision 0012: when the trip on tap walks more than 10 minutes at the start or end, the card keeps
that walk and adds the ride that arrives at the same time with a shorter walk ("oder 115 ab Teltower
Damm, gleiche Ankunft"), where there is one. Measured in S039 (`bench/feeder.ts`): 11 % of trips,
14 min less walking (median), 84 % of them one ride more.

## Build steps only — acceptance criteria
- [ ] Routing: an alternative trip for a journey — the same search with maxInitialWalk, maxFinalWalk
  and maxFallbackWalk capped at 600 s, kept when it arrives at the same second and walks 180+ s less
  at the ends (`alternativeTrip` or similar, next to `laterStart`/`laterChange`); only run when the
  shown trip has an end walk over 600 s. Leaving (nowRun), Ankommen (the reversed timetable) and
  trips between two places (`tripBetween`) alike
- [ ] Worker: the alternative is searched after the trip's message is posted and sent as its own
  message, so tap-to-trip does not wait for it; the card shows it when it arrives and drops it when
  the tap changes
- [ ] Card: one line under the trip, both languages (i18n), with the line, the boarding stop and
  "gleiche Ankunft"; tapping it swaps the card to the ride and offers the walk back the same way
- [ ] Tests: routing (the alternative found, not found when the walk is short, the 180 s rule),
  worker message flow, card rendering
- [ ] `bench/feeder.ts` reports how often the alternative is shown and `bench/suite.ts --vbb`
  still agrees on arrivals; timings at 360×740 (also 4×): tap to trip unchanged, the worker's
  extra time per tap reported

## Notes
- Measured 2026-11-06 (S039): cap 10 min, same arrival; +60 s tolerance buys nothing; 15 min cap
  finds fewer. The pass costs 8 ms in Node (appJourney with the caps).
- Design worked out 2026-11-06 (nothing built; branch step/S045-feeder-line off main 242804d):
  - Routing: no search changes needed. Helpers next to `laterChange` (journey.ts): `endWalkSeconds(j)`
    (walk before the first ride + after the last) and the constants ALT_WALK_CAP_S = 600,
    ALT_MIN_SAVING_S = 180. The alternative is the same search with maxInitialWalkSeconds,
    maxFinalWalkSeconds and maxFallbackWalkSeconds = 600 (walkSpeedMps etc. unchanged).
  - Worker (worker-trips.ts): two tap paths. (a) `trip(last, nowRun(...))` (map's own grid or the
    pass from now): rerun travelTimes with the caps and the same leaveAt/origin, nearRun with the caps,
    journeyTo → laterStart → laterChange; keep when `seconds` is equal and endWalk saving ≥ 180 s.
    (b) `bothWays` (tripBetween, used whenever `otherTt` is in): tripBetween with the capped options
    and the span `{ leave: <the map's moment or f.leave>, arrive: f.arrive }` (Ankommen: leaving no
    earlier than f.leave, arriving by -last.from), so the arrival (Ankommen: the leaving) is kept by
    construction; fewest rides inside the caps gives the feeder version. Only when an end walk of the
    shown trip is > 600 s; skip meeting points (several journeys), home maps, bikeonly. Run it after
    `post({ type: 'trip', ... })` in worker.ts (check `msg.id === latestTrip` again), post
    `{ type: 'tripAlt', id, trip: tripMessage([alt]), where: 'start' | 'end', line, stop, saved }`
    (`where`: at which end the walk shrank; `line`/`stop`: the alt's first ride and its boarding stop,
    or last ride and its exit stop; `saved`: minutes).
  - Protocol: new FromWorker `tripAlt`; no ToWorker change.
  - Card (tap.ts): keep `alt` per tripId; onTrip resets it; `renderAlt()` appends
    `<small class="trip-alt" role="button" tabindex="0">` under #trip (like addChangeNotes), text i18n
    `tripAltStart` 'oder {line} ab {stop} · gleiche Ankunft, {n} Min. weniger zu Fuß' /
    `tripAltEnd` 'oder {line} bis {stop} · …' / `tripAltBack` 'oder zu Fuß ({n} Min.) · gleiche Ankunft';
    EN 'or {line} from {stop} · same arrival, {n} min less walking' etc. Tapping swaps
    `showTrip(alt.trip)` (map lines follow via setTrip inside showTrip) and the line points back; the
    drawer's list (`connections`) stays the original's. Style like `.trip-long-walk` (style.css ~1909),
    colour muted, pointer.
  - Tests: worker-trips.test.ts with the mini fixture needs a case where a long walk and a feeder ride
    reach the same train — the fixture's Tram G–H with the 180 s footpath G–C may serve: a place
    near H reached by U1 to C + walk vs. tram; else extend the fixture. trip-card.test.ts for the line.
  - Bench: `bench/feeder.ts` row "10 min / +0 s, only when it saves 3+ min" is the shown rule (11 % of
    trips, 8 ms per extra pass in Node).
