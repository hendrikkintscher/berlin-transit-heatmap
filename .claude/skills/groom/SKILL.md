---
name: groom
description: Tidy the bookkeeping — feature_list.json, PROGRESS.md, CHANGELOG/VERSION, stray notes files. Run occasionally.
disable-model-invocation: true
---

Tidy the bookkeeping. Change only bookkeeping files, never code. Don't start any task.

1. `feature_list.json`: tasks marked `passes: true` whose `test` no one ran → report. Size L tasks → propose a split.
   High-priority tasks blocked by a dep that's gone or done? Unknown deps? Propose fixes; change only after a yes.
2. For each open task: still wanted? Size, owner and `test` still right? Propose (don't silently do) deleting obsolete ones.
3. `PROGRESS.md`: more than ~10 entries → roll the oldest into the 3-line `## Earlier (summary)`.
4. VERSION should match the newest CHANGELOG section.
5. Stale handovers, scratch notes, duplicate docs (`git ls-files '*.md'`) → list them with where their content belongs;
   delete only after the user's OK. Decisions found in the repo → the project's vault note (cross-project ones → the brain).
6. Run `bash scripts/check.sh`. Report what you changed and what you propose in ≤12 lines.
