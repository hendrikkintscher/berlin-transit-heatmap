---
status: accepted
date: 2026-11-03
---

# 0001 — Plan and build with the Claude Code project template

## Context

The roadmap (V2.6) had grown to 168 lines mixing plan, rules and evidence, with its own version (V2.x),
step ids that were guessed app versions, an Inbox, and LATER.md beside it. Hendrik made a template
repo (hendrikkintscher/claude-project-template) with a step system, hooks and skills, and asked to
reorganise this repo the same way.

## Options considered

- **Full conversion**: step files with tags, ROADMAP.md as an index, VERSION, Keep a Changelog, hooks
  and skills. One way of working across projects; `steps.sh` and the hooks expect this layout.
- **Tooling only**: hooks, skills and check.sh, keeping the V2.x roadmap. Less churn, but `steps.sh`,
  `/step` and the roadmap guard would not fit the roadmap.

## Decision

We chose **full conversion** (Hendrik, 2026-11-03), with these adjustments for this repo:

- Step ids are S001…; the app version is set only when a step ships (`steps.sh bump`, patch by
  default, minor for a new milestone), and the bump also writes both package.json files so the
  automatic `vX.Y.Z` tag and the Mehr menu keep working. A test keeps the three in step.
- ROADMAP.md keeps the Now / Next / Later themes as headings over the step lines.
- The speed rules (timings at 360×740, also at 4× CPU) stay part of every build step.

## Consequences

- Good: the roadmap stays short; lookups are cheap (`steps.sh next`); bookkeeping is enforced by hooks.
- Bad / accepted cost: the Stop hook runs `pnpm check` (about a minute) when a turn changed code;
  the old version ids live on only in the step notes and CHANGELOG.md.
