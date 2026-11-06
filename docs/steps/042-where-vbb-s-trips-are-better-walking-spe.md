---
id: 042
title: Where VBB's trips are better: walking speed, change times, step-free rules
type: decision
kind: research
priority: P2
size: S
needs: S040
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
Know why VBB's planner finds a trip 3+ min better than the app's, where the app's own data has
none better (the reference search agrees with the app), and decide what to change.

## Decision steps only
- Question: which model differences make VBB's trips better, and which should the app take over?
- Measure: bench/suite.ts (seed 40, from 2026-11-06): VBB 3+ min better on foot 12.3 % of 941, arriving 14.2 % of 183, step-free 24.4 % of 176. Class each case: VBB walks a stretch quicker (walking speed, straight line against streets), changes quicker (station change times), uses a stop or ride the app's step-free rule leaves out, or a trip outside the app's hourly file.
- Results: <table goes here once measured; recommendation in one line>

## Notes
- S039 covers the same arrival with more walking; this one the arrival itself.
