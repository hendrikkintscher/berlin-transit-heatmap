---
name: task
description: The procedure for tasks in feature_list.json — add, start, measure, finish, run approved batches. Use whenever a task is added, started, continued or finished, a new idea or fix comes up, or Hendrik approves a batch.
argument-hint: 'add <title> | start <id> | done <id> | batch <ids> | next'
---

Tasks live only in `feature_list.json`; details too big for one line go in `docs/specs/`. The gates are
in CLAUDE.md "How we work"; this is the how.

Arguments: $ARGUMENTS

## add

Append one entry to `features` (next free id, `S047` style, continuing the old step numbers):
`{"id", "title", "kind", "owner", "priority", "size", "deps": [], "test", "passes": false}`

- kind: feature · fix · refactor · chore · maintenance · research (= measure and decide). owner: hendrik · claude.
- priority: high · medium · low. size: S < half a day · M ~1 day / ~400 lines · L too big → add smaller tasks instead.
- `test`: one line saying how we'll know it works — a command, a bench result or a concrete check.
- Came up during another task? Don't work on it — one line: "added S047 (fix · medium · S)".

## start (only the task named for this thread, after Hendrik's yes)

Refuse L tasks (propose a split) and tasks whose `deps` aren't `passes: true`.

- **Research:** measure, write the results into the task's spec, send Hendrik a short table + one-line
  recommendation, stop.
- **Build:** branch `task/S047-<slug>` (or the session's own `claude/…` branch), implement with tests,
  time it at 360×740 against main (CLAUDE.md "Speed comes first"), then **done**.

## done

**Research**, after Hendrik's yes: save the decision in the project's vault note (cross-project: the
brain). If it changes how Claude works every session, add one line to CLAUDE.md. Building the choice is
real work → `add` build task(s). Then `passes: true` and a short docs PR.

**Build:**

1. Run the task's `test` and `bash scripts/check.sh`; both pass → set `passes: true`. Not run or failed → it stays `false`.
2. `git diff --stat main...` vs the size — clearly bigger? Stop and ask: split, or accept.
3. CHANGELOG.md entry under `## [Unreleased]`, then `bash scripts/bump.sh` (patch; `minor` for a new
   milestone) — sets VERSION and both package.json files and moves the entry under the new version.
4. Commit, open the PR (fill in the PR template, timings included).
5. CI green (`check`, `smoke`, `speed`), squash-merge after Hendrik's yes (deploys to Pages), check the live site.

Then: short summary, and ask "Next: S0NN — <title>?" (highest-priority open task whose deps pass). Wait.

## batch (Hendrik said "yes S047–S049")

Only for build tasks sized S whose deps pass or are inside the batch. Run start → done for each in
order, one PR each. No questions in between; stop at the first failing check or oversize diff and report.

## next

List the open tasks by priority, with unmet deps, in a few lines. Don't start anything.
