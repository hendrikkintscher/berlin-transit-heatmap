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
- **The `test` is frozen once the task is added.** The session that builds it never softens or rewrites it.
  Found it wrong or too strict? Show Hendrik old → new in one line and stop that task until he says yes;
  other tasks of a batch go on. Only after the yes, change it, in its own commit.
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

1. Run the task's `test` and `bash scripts/check.sh`; both pass → go on. Not run or failed → it stays `false`.
2. **Size M:** you don't review your own diff. Commit the change with `passes: false` and push, then ask the
   standing reviewer (`C:\Claude\reviewer`, README "Review on request"): `SendMessage` to a running reviewer
   session if one is linked or listed, else `start_session` in `C:\Claude\reviewer` (preset `reviewer`) with
   `Review <repo> <task id> <first sha>^..<last sha>` and one line on what the change does. Gaps it reports
   get fixed (or, if you disagree, Hendrik decides), pushed, and you ask again. Only `Verdict: clean` lets it
   pass: set `passes: true` with `Review: clean (reviewer YYYY-MM-DD)` in the commit message. No session tools
   (cloud, claude.ai): the `reviewer` agent (`.claude/agents/reviewer.md`) instead, with the task id and the
   output of `git diff main...`, and `Review: clean (agent)`. Size S: set `passes: true`.
3. `git diff --stat main...` vs the size — clearly bigger? Stop and ask: split, or accept.
4. CHANGELOG.md entry under `## [Unreleased]`, then `bash scripts/bump.sh` (patch; `minor` for a new
   milestone) — sets VERSION and both package.json files and moves the entry under the new version.
5. Commit, open the PR (fill in the PR template, timings included).
6. CI green (`check`, `smoke`, `speed`), squash-merge after Hendrik's yes (deploys to Pages), check the live site.

Then: short summary, and ask "Next: S0NN — <title>?" (highest-priority open task whose deps pass). Wait.

## batch (Hendrik said "yes S047–S049")

Only for build tasks sized S whose deps pass or are inside the batch. Run start → done for each in
order, one PR each. No questions in between; stop at the first failing check or oversize diff and report.
A task whose `test` needs changing waits for Hendrik's yes (see add); the rest of the batch goes on.

## next

List the open tasks by priority, with unmet deps, in a few lines. Don't start anything.
