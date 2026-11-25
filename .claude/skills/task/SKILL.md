---
name: task
description: The procedure for tasks in feature_list.json — add, start, measure, finish, run approved batches. Use whenever a task is added, started, continued or finished, a new idea or fix comes up, or the user approves a batch.
argument-hint: "add <title> | start <id> | done <id> | batch <ids> | next"
---

Tasks live only in `feature_list.json`; details too big for one line go in `docs/specs/` (`/spec`). The gates are in CLAUDE.md "How we work" (or "Definition of done"); this is the how.
**Repo rules first:** CLAUDE.md `## Task rules` (if there is one) sets this repo's id style, kinds, checks, vault note, version files, deploy or device steps and branch flow. Where it differs from this page, it wins.

Arguments: $ARGUMENTS

## add
Append one entry to `features` (or the list the repo uses), next free id in the repo's style (`T-001` by default):
`{"id", "title", "kind", "owner", "priority", "size", "deps": [], "test", "passes": false}`
- kind: feature · fix · refactor · chore · maintenance · research (= measure and decide). owner: hendrik · claude.
- priority: high · medium · low. size: S < half a day · M ~1 day / ~400 lines · L too big → add smaller tasks instead.
- `test`: one line saying how we'll know it works — a command or a concrete check someone can run. One that needs the user's eyes, a device or hardware says so.
- **The `test` is frozen once the task is added.** The session that builds it never softens or rewrites it. Found it wrong or too strict? Show the user old → new in one line and stop that task until the user says yes; other tasks of a batch go on. Only after the yes, change it, in its own commit.
- Came up during another task? Don't work on it — one line: "added T-012 (fix · medium · S)".
- Edit the file as text; don't re-dump it with `json.dumps` (that reformats every line).

## start (only the task named for this thread, after the user's yes)
Refuse L tasks (propose a split) and tasks whose `deps` aren't `passes: true`.
- **Research / decision:** measure or lay out the options, send the user a short table + one-line recommendation, stop.
- **Test / review (owner hendrik):** tell the user in one line what to try or look at (with paths), stop.
- **Build:** on `main` (unless Task rules name a branch flow), implement with tests, then **done**. Other sessions may share this folder: touch and commit only your own files.

## done
**Research**, after the user's yes: save the decision in the project's vault note (named in CLAUDE.md; cross-project: the brain, see the shared-brain skill). If it changes how Claude works every session, add one line to CLAUDE.md. Building the choice is real work → `add` build task(s). Then `passes: true` and a short commit.

**Build:**
1. Run the task's `test` and `bash scripts/check.sh` (or the check Task rules name); both pass → go on. Not run or failed → it stays `false`.
2. **Size M:** you don't review your own diff. Commit the change with `passes: false` and push, then ask the standing reviewer (`C:\Claude\reviewer`, README "Review on request"): `SendMessage` to a running reviewer session if one is linked or listed, else `start_session` in `C:\Claude\reviewer` (preset `reviewer`) with `Review <repo> <task id> <first sha>^..<last sha>` and one line on what the change does. Gaps it reports get fixed (or, if you disagree, the user decides), pushed, and you ask again. Only `Verdict: clean` lets it pass: set `passes: true` with `Review: clean (reviewer YYYY-MM-DD)` in the commit message. No session tools (cloud, claude.ai): the `reviewer` agent instead, with the task id, the start commit and the output of `git diff <start commit>`, and `Review: clean (agent)`.
3. The diff since the task started (`git diff --stat <start commit>`; generated files don't count) vs the size — clearly bigger? Stop and ask: split, or accept.
4. Bump `VERSION` (patch for fix, else minor; plus any version files Task rules name) and add `## X.Y.Z · YYYY-MM-DD` to CHANGELOG.md.
5. Commit only this task's files (`git commit -m "…" -- <paths>`, never `-a` / `git add -A`), `git pull --rebase`, push to `main`. The pre-push hook runs `scripts/check.sh`.
6. A part of the `test` that needs a device, a deploy or the user's look (per Task rules): ask before installing or deploying, say in one line what to look at, and set `passes: true` only once it's seen; until then it stays `false` and PROGRESS.md says what is left.

Then: short summary, and ask "Next: T-0NN — <title>?" (highest-priority open task whose deps pass). Wait.

## batch (user said "yes T-004–T-006")
Only for build tasks sized S whose deps pass or are inside the batch, and none that waits for the user's look or a step only the user can do. Run start → done for each in order, one commit each. No questions in between; stop at the first failing check or oversize diff and report. A task whose `test` needs changing waits for the user's yes (see add); the rest of the batch goes on.

## next
List the open tasks by priority, with unmet deps and what waits for the user, in a few lines. Don't start anything.
