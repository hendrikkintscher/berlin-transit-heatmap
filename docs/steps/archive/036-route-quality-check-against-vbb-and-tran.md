---
id: 036
title: Route quality check against VBB and Transitous
type: build
kind: chore
priority: P1
size: M
needs: -
status: done
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
A repeatable check of the trip on tap against VBB's own journey planner (HAFAS) and Transitous
(MOTIS) for many random connections at random times, which shows how often the app's trip is
worse and why (Hendrik, 2026-11-05: "getting off one stop before the ideal one and suggesting a
foot path instead").

## Build steps only — acceptance criteria
- [x] `packages/routing/bench/providers.ts`: random places and times, the app's trip on tap (same code path as the worker), the same trip from VBB HAFAS and Transitous, cached answers
- [x] A report: arrival difference per provider, share where the app is later by 3+ min, and each worse case classed (early alight + walk, other line, longer walk, missed connection)
- [x] A check inside the app's own trip: staying on the last vehicle to a later stop, would it arrive as early with less walking?
- [x] Results in the PR; fixes for what it finds become their own steps
- [x] Tests cover the new behaviour

## Notes
- Providers: v6.vbb.transport.rest (VBB HAFAS, public, 100 req/min), api.transitous.org (open, polite rate).
- Found: S037 (trip card clocks), S038 (stay on), S039 (bus instead of a long walk).
- Days from tomorrow on, so neither provider mixes in real-time delays; planned times only.
