# Berlin transit heatmap

How long it takes to get anywhere in Berlin by public transport, as a travel-time map for phones;
live at https://hendrikkintscher.github.io/berlin-transit-heatmap/. Background in [README.md](README.md).
How to write each language here (TypeScript, JS, shell, Actions YAML, HTML/CSS): [BEST_PRACTICES.md](BEST_PRACTICES.md).

## How we work

The coordinator is the main session (not a subagent). The procedure for every case is in the
`/step` skill — use it whenever you create, start or finish a step.

- **One thread per roadmap step.** Work only on the step named for this thread, never the next one.
  Before starting another step, ask and wait for an explicit yes.
- **Decision steps:** measure first (or compare concrete facts where measuring is impossible),
  send a short table + one-line recommendation, then stop. Build nothing until Hendrik says yes.
- **Build steps (after a yes):** one PR per step, with tests, timings (see "Speed comes first"), a
  CHANGELOG entry, a version bump (`scripts/steps.sh bump`: patch, `minor` for a new milestone; it
  sets VERSION and both package.json files) and the step removed from ROADMAP.md. Hooks enforce the
  bookkeeping and that checks pass. Get CI green (`check`, `smoke`, `speed`), squash-merge (merging
  deploys to Pages and tags `vX.Y.Z`), then check the live site.
- **Tags** on every step: kind, priority (P1–P3), size (XS/S/M; L must be split first), needs.
  Point out a P1 sitting below lower priorities, or a step listed before one it needs.
- **Size:** if the diff is clearly bigger than the size tag, stop and ask: split, or accept.
- **Batch approval** ("yes S004–S006") only for build steps sized XS or S. A batch of only XS
  steps is one PR with one patch bump; otherwise one PR per step. No questions in between,
  stop at the first problem. Decision and M steps always need their own yes.
- **New ideas** mentioned along the way become their own later step (`/step new`), never part
  of the current one. Say in one line that you added it, with its tags.
- **Pause (Hendrik, 2026-11-03):** after S018 the work stops. Start no step, not even the one
  `scripts/steps.sh next` shows, until Hendrik names it. Bug fixes he reports are fine.
- **"continue"** means the next step you just proposed — never reopening finished work.
  If no specific step was proposed, or it's unclear, ask.
- **When a step or batch is finished:** short summary (what changed, PR link, version), then ask
  "Next: S00N — <title> (tags)?" from `scripts/steps.sh next`. Don't start until Hendrik says yes.

## Speed comes first

Nothing may slow taps or the first map. Report timings before/after at phone size 360×740,
also with the page CPU slowed 4× (CDP `Emulation.setCPUThrottlingRate`; Chrome cannot slow
the worker). A useful setup: build `packages/web/dist` for main and for the branch, serve each
locally with `/data/berlin/*` fetched from the live site (cached), block other hosts and give
MapLibre a blank style, launch Chromium with `--ignore-gpu-blocklist --enable-gpu-compositing
--use-angle=swiftshader --enable-unsafe-swiftshader` (plain headless copies the map back each
frame, ~75 ms that delays every worker answer; decision 0008), and time a fresh visit: first
map (worker 'result' message), tap to trip on the card, ⇅, moving the rings. Medians of 6–8
visits; 4× first-map times are bimodal. `scripts/speed/browser.mjs` does all of this for the first
map and tap to trip (`--base` times main's dist in the same run); add flows to it as steps need them.
The CI speed job checks bundle sizes (`scripts/speed/budget.json`) and Node map timings;
raising a budget is a deliberate edit with the reason in the PR.

## Where things live

| What                                                            | Where                                             |
| --------------------------------------------------------------- | ------------------------------------------------- |
| Vision + ordered steps in Now / Next / Later themes (≤80 lines) | `ROADMAP.md`                                      |
| One file per step — change only via `scripts/steps.sh`          | `docs/steps/NNN-slug.md`                          |
| Finished steps (don't read unless asked)                        | `docs/steps/archive/`                             |
| Decision records (after Hendrik's yes)                          | `docs/decisions/NNNN-slug.md`                     |
| Specs for steps too big for their step file; later wishes       | `docs/specs/` (`later.md`)                        |
| App version / changelog                                         | `VERSION` (+ both `package.json`), `CHANGELOG.md` |
| Session handoff (overwritten, not committed)                    | `docs/handoff.md`                                 |
| Speed budget                                                    | `scripts/speed/budget.json`                       |

Find work with `scripts/steps.sh next | list [tag] | show NNN` — don't open step files one by one.
Implementation details go in commit messages and code comments, not planning files.
Don't create other planning or notes files; if something doesn't fit, ask.

## Commands

```sh
pnpm check                                   # lint, format, typecheck, all tests (= bash scripts/check.sh)
pnpm --dir packages/web build                # -> packages/web/dist
node scripts/smoke/smoke.mjs                 # browser smoke test (as CI)
node scripts/speed/check.mjs --data packages/routing/.data [--base <main checkout>]
node scripts/speed/browser.mjs --data packages/routing/.data [--base <main dist>] [--cpu 4]
pnpm --dir packages/routing fetch-data       # real timetable + walk.bin into packages/routing/.data
```

Benchmarks on the real data live in `packages/routing/bench/` (`swap.ts`: same trip from
both ends; `goal.ts`: map to a Ziel leaving at a time; `walkrule.ts`: map minutes against the
trip on tap; `kept.ts`: a trip kept before the footpaths; `arrivehour.ts`: Ankommen trips
against the map's hour; `rollon.ts`: a missed connection rolling on, on the hourly files built below; `latest.ts`: the tap to a Ziel leaving with its latest leaving read off the map's profile;
`providers.ts`: the trip on tap against VBB's planner and Transitous for random trips, answers cached). The release downloads are public: if `fetch-data` gets a 401, run it
without `GITHUB_TOKEN`/`GH_TOKEN`. The GTFS feed is the release `gtfs-latest` (`GTFS.zip`);
`node packages/timetable-build/bin/build-timetable.js --gtfs data/gtfs --out <dir>` builds all hourly files in about 30 s.

The cloud session hook (`.claude/hooks/session-install.sh`) installs the packages and fetches
the bench data; `.claude/hooks/session-start.sh` prints where the roadmap stands.

On Hendrik's Windows PC (local Claude Code) the install hook does nothing: run `pnpm install` and
`pnpm --dir packages/routing fetch-data` once yourself. The hooks are bash scripts and need Git Bash
on the PATH. `browser.mjs` uses the installed Chrome there (or `CHROMIUM=<path>`); timings on a
desktop are not comparable with the cloud container's, so time main and the branch on the same machine.

## Gotchas

- Several chats may share one container and one branch:
  check `git log origin/main..HEAD` and `git status` before starting, and build on (or ask
  about) commits you did not make instead of overwriting them.
- When a step's PR is merged, reset the branch to `origin/main` before the next step.
- Old branches (2026-10-16): every `claude/project-thread-*` branch was checked against main and
  holds nothing unmerged (all squash-merged through their PRs). Deleting them from a session was
  blocked; Hendrik can delete them on GitHub. Don't merge them: their diffs are stale copies.
- The working walk rule since 0.13.9: on foot, walks up to 30 minutes count at both ends
  (`FASTEST_WALK` in `packages/web/src/worker-runs.ts`); the Node benches in
  `packages/routing/bench` pass their own options.
- 0.15.13 fixed an empty app after a deploy on a slow network (`packages/web/public/sw.js`,
  `shellReady()`). It is not confirmed that this was the "Navigation lädt nicht" Hendrik saw; if he
  reports it again, the cause is elsewhere.
- Measurement scripts of finished steps (S001–S034) were kept outside the repo; their numbers are in
  CHANGELOG.md and the PRs. Don't look for them; rebuild from `scripts/speed/browser.mjs`.
- PRs here are usually opened with the GitHub tools, not `gh pr create`, so the pr-guard hook does
  not see them: check the bookkeeping (VERSION, CHANGELOG.md, ROADMAP.md) yourself.
- `docs/steps/` is left out of Prettier (`steps.sh` writes it); run `npx prettier --write` on the
  other docs you change.

## Definition of done

- `bash scripts/check.sh` passes — show its output.
- Acceptance criteria in the step file are ticked.
- Timings before/after reported in the PR (build steps).
- No stray debug output; TODOs only with a step id: `TODO(S012): ...`.
