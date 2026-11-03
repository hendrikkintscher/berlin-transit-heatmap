---
name: step
description: The procedure for roadmap steps — create, tag, start, measure, finish, record decisions, run approved batches. Use whenever a step is created, started, continued or finished, a new idea or fix comes up, or the user approves a batch.
argument-hint: 'new <title> | start <id> | done <id> | batch <ids> | next | list [tag]'
---

Steps are managed only through `scripts/steps.sh` — never hand-number, move or delete step files or
edit the Steps list in ROADMAP.md by hand. The gates are in CLAUDE.md "How we work"; this is the how.

Arguments: $ARGUMENTS

## new

`bash scripts/steps.sh new "<title>" build|decision kind=… priority=… size=… [needs=S0NN,…]`

- kind: feature · fix · refactor · chore · research (= decision steps). priority: P1 must · P2 should · P3 could.
- size: XS a few lines · S < half a day · M ~1 day / ~400 lines · L too big → create smaller steps instead.
- Fill in Goal, plus Question/Measure (decision) or acceptance criteria (build).
- Came up during another step? Don't work on it — one line: "added S0NN (fix · P2 · XS)".
- Fix tags later with `bash scripts/steps.sh tag NNN size=M priority=P1 needs=S002`.

## start (only the step named for this thread, after the user's yes)

`bash scripts/steps.sh set NNN doing` — refuses L steps and blocked steps. Read it with `show NNN`.

- **Decision step:** measure, fill in Results in the step file, send the user a short table +
  one-line recommendation, `set NNN waiting`, stop.
- **Build step:** branch `step/S0NN-<slug>` (or the session's own `claude/…` branch), implement with tests,
  time it at 360×740 against main (CLAUDE.md "Speed comes first"), then **done**.

## done

**Decision step**, after the user's yes:

1. Copy `docs/decisions/0000-template.md` to the next `docs/decisions/NNNN-<slug>.md` (≤30 lines):
   the options, the measured table, the choice, `Step: S0NN`. Reversing an older decision: new record,
   old one gets `status: superseded by NNNN`.
2. If it changes how Claude works every session, add one line to CLAUDE.md.
3. If building the chosen option is real work: `new` build step(s).
4. `bash scripts/steps.sh done NNN`, commit (a docs-only PR is fine).

**Build step:**

1. `bash scripts/check.sh` passes; tick the acceptance criteria.
2. `git diff --stat main...` vs the size tag — clearly bigger? Stop and ask: split, or accept.
3. CHANGELOG.md entry under `## [Unreleased]`.
4. `bash scripts/steps.sh bump` (patch; `minor` for the first step of a new milestone) — sets VERSION and
   both package.json files, and moves the entry under the new version.
5. `bash scripts/steps.sh done NNN`, commit, open the PR (fill in the PR template, timings included).
6. CI green (`check`, `smoke`, `speed`), squash-merge (deploys to Pages), check the live site.

Then: short summary, and ask "Next: S00N — <title> (tags)?" from `bash scripts/steps.sh next`. Wait.

## batch (user said "yes S004–S006")

Only valid if every step is a build step sized XS or S and their `needs` are finished or inside the batch.

- **All XS:** one branch `step/S004-S006`, one commit per step, one CHANGELOG entry per step,
  one `bump patch`, `done` for each, one PR.
- **Otherwise:** run **start → done** for each step in order, one PR each.
  No questions in between; stop at the first failing check or oversize diff and report.

## next / list [tag]

Run it and summarise in a few lines, including blocked steps. Don't start anything.
