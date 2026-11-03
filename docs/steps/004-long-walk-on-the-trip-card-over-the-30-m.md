---
id: 004
title: Long walk on the trip card over the 30-minute walk rule
type: decision
kind: research
priority: P3
size: S
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Know why a walk at an end of the trip on tap can come out over the 30 minutes of the walk rule, and whether to fix it.

## Decision
- Question: Where do the extra minutes come from (the cell against the tapped point, or the fallback walk), and is a fix worth it?
- Measure: Alexanderplatz to the Grunewald place 52.489, 13.229 walks 33 minutes from S Grunewald; check that case and how often it happens over random places.
- Results: <table and one-line recommendation once measured; nothing changes without Hendrik's yes>

## Notes
- Inbox note from 0.13.17 (2026-11-03). Walk rule: `FASTEST_WALK` in `packages/web/src/worker-runs.ts`.
