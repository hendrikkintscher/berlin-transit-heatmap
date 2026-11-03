---
name: groom
description: Clean up the planning files — archive finished steps, check tags, priorities and dependencies, shorten bloated notes, check ROADMAP.md matches reality. Run occasionally.
disable-model-invocation: true
---

Tidy the planning system. Change only planning files, never code. Don't start any step.

1. `bash scripts/steps.sh list all` — any step with status done still in docs/steps/? Run `done <id>`.
2. Steps in docs/steps/ missing from ROADMAP.md, or roadmap lines without a step file → report.
3. Order vs tags: P1 below P2/P3 steps? A step listed before one it `needs`? Blocked steps whose
   blocker is gone? Build steps tagged L (must be split)? Propose fixes — reorder or `tag` only after a yes.
4. For each open step: still wanted? Size still right? Notes ≤10 lines and still true? Trim them.
   Propose (don't silently do) deleting obsolete steps.
5. ROADMAP.md: any prose, logs or notes that crept in → move into a step file or delete.
6. CHANGELOG `[Unreleased]` should be empty on main, and VERSION should match the newest CHANGELOG section.
   Open XS steps piling up → suggest approving them as one batch.
7. Stray planning/notes files outside docs/ (`git ls-files '*.md'`) → propose where their content belongs.
8. Report what you changed and what you propose in ≤12 lines.
