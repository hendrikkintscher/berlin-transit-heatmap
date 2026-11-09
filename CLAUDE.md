# Berlin transit heatmap

**Kind: coding project.** We look for technical solutions: code, tests, automation, tooling. If a problem would be better solved without code (a process, a decision, a message, an existing service), say so in one line before building anything.

How long it takes to get anywhere in Berlin by public transport, as a travel-time map for phones;
live at https://hendrikkintscher.github.io/berlin-transit-heatmap/. Background in [README.md](README.md).
How to write each language here (TypeScript, JS, shell, Actions YAML, HTML/CSS): [BEST_PRACTICES.md](BEST_PRACTICES.md).

**Vision:** a map you can trust, faster than you can ask the next question (the Berlin app finished at
1.0.0). Every change is judged first by the timings at 360×740 (also with the page CPU slowed 4×), then
by agreement between the trip on tap and the map's minutes. A change that slows any timing does not ship.

**Out of scope:** Android app (native or TWA) and beta testing (Hendrik, 2026-10-13). Set aside
2026-10-12, only if Hendrik asks again: fare zones on the map, sharing a picture of the map, population
within N minutes, dark map and icon shortcuts. Planned for much later: `docs/specs/later.md`.

## How we work

The coordinator is the main session (not a subagent). The procedure for every case is in the
`/task` skill — use it whenever you add, start or finish a task.

- **One thread per task.** Work only on the task named for this thread. Before starting another
  one, ask and wait for an explicit yes.
- **Pause (Hendrik, 2026-11-03):** start no task until Hendrik names it. Bug fixes he reports are fine.
- **Research tasks:** measure first (or compare concrete facts where measuring is impossible),
  send a short table + one-line recommendation, then stop. Build nothing until Hendrik says yes.
- **Build tasks (after a yes):** one PR per task, with tests, timings (see "Speed comes first"), a
  CHANGELOG entry and a version bump (`bash scripts/bump.sh`: patch, `minor` for a new milestone; it
  sets VERSION and both package.json files). Get CI green (`check`, `smoke`, `speed`), squash-merge
  (merging deploys to Pages and tags `vX.Y.Z`), then check the live site.
- **Size:** S < half a day · M ~1 day / ~400 lines · L too big, split first. If the diff is clearly
  bigger than the size, stop and ask: split, or accept.
- **Batch approval** ("yes S047–S049") only for build tasks sized S. Research and M tasks always need
  their own yes. No questions in between, stop at the first problem.
- **New ideas** mentioned along the way become their own task (`/task add`), never part of the
  current one. Say in one line that you added it.
- **"continue"** means the next task you just proposed — never reopening finished work.
  If no specific task was proposed, or it's unclear, ask.
- **When a task or batch is finished:** short summary (what changed, PR link, version), then ask
  "Next: S0NN — <title>?". Don't start until Hendrik says yes.

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

One home per kind of info, no duplicates.

| What                                                               | Where                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Tasks (id, title, kind, owner, priority, size, deps, test, passes) | `feature_list.json`                                                                        |
| Details of a task too big for one line; later wishes               | `docs/specs/` (`later.md`)                                                                 |
| Session log, newest first, last ~10 entries + 3-line summary       | `PROGRESS.md`                                                                              |
| History: app version / changelog                                   | git + `CHANGELOG.md`, `VERSION` (+ both `package.json`)                                    |
| Decisions                                                          | vault note `Projects/Own apps and tools/Transport in Berlin visualised.md`; until S046 also `docs/decisions/` |
| Speed budget                                                       | `scripts/speed/budget.json`                                                                |
| Finished step files (before 1.0.7)                                 | git history: `git show 012f587:docs/steps/archive/<file>`                                  |

Implementation details go in commit messages and code comments, not planning files.
Don't create other planning or notes files; if something doesn't fit, ask.

## Commands

```sh
pnpm check                                   # lint, format, typecheck, all tests (bash scripts/check.sh adds the bookkeeping)
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
`providers.ts`: the trip on tap against VBB's planner and Transitous for random trips, answers cached;
`suite.ts`: the route quality suite with its targets, `--gtfs` replays rides against the raw feed, `--vbb` asks VBB, `--ci` is the speed job's sample; `gridexact.ts`, `vbbwhy.ts`, `footpaths.ts`: the measurements behind S041 and S042). The release downloads are public: if `fetch-data` gets a 401, run it
without `GITHUB_TOKEN`/`GH_TOKEN`. The GTFS feed is the release `gtfs-latest` (`GTFS.zip`; `GITHUB_REPOSITORY=hendrikkintscher/berlin-transit-heatmap scripts/publish/download.sh gtfs-latest work/gtfs GTFS.zip`, unzip to `work/gtfs/feed` for `suite.ts --gtfs`);
`node packages/timetable-build/bin/build-timetable.js --gtfs data/gtfs --out <dir>` builds all hourly files in about 30 s.

The cloud session hook (`.claude/hooks/session-install.sh`) installs the packages and fetches
the bench data; `.claude/hooks/session-start.sh` prints the open tasks and the last session.

On Hendrik's Windows PC (local Claude Code) the install hook does nothing: run `pnpm install` and
`pnpm --dir packages/routing fetch-data` once yourself. The hooks are bash scripts and need Git Bash
on the PATH. `browser.mjs` uses the installed Chrome there (or `CHROMIUM=<path>`); timings on a
desktop are not comparable with the cloud container's, so time main and the branch on the same machine.

## Gotchas

- Several chats may share one container and one branch:
  check `git log origin/main..HEAD` and `git status` before starting, and build on (or ask
  about) commits you did not make instead of overwriting them.
- When a task's PR is merged, reset the branch to `origin/main` before the next task.
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
  not see them: check the bookkeeping (VERSION, both package.json, CHANGELOG.md, feature_list.json) yourself.
- Prettier checks every Markdown and JSON file (`pnpm format:check` in CI); run `npx prettier --write`
  on the docs you change.
- Route quality (S036–S040, 2026-11-06): the open findings and options are in `docs/specs/s042-*.md` and
  the finished step files S039 and S041 (`git show 012f587:docs/steps/archive/041-map-minutes-a-nearer-stop-reached-later-.md`).
  Not in git, so a new machine makes them again: the raw GTFS feed (recipe under Commands),
  `work/suite-*` outputs (`bench/suite.ts`), and the planners' answers in `packages/routing/.data/providers/`
  (asking VBB again takes about 15 min per 1,000 trips; Transitous and VBB need network access).
- Pushes from the cloud container sometimes fail with "fatal error in commit_refs": retry, and check with
  `git fetch` that the branch really moved before saying it is pushed.

## Definition of done

- The task's `test` was actually run and passed — only then `passes: true`.
- `bash scripts/check.sh` passes (bookkeeping, lint, format, typecheck, tests) — show its output.
- Timings before/after reported in the PR (build tasks).
- No stray debug output; TODOs only with a task id: `TODO(S043): ...`.

## Files you create

Write new files inside this folder. Files for other people (to send) go to `C:\Claude\_ZuVerschicken`.
Files Hendrik has to handle himself (check, sign, upload, install, decide) go to `C:\Claude\_ZumVerarbeiten`,
so they do not get lost in a project folder. Name both `YYYY-MM-DD_Title.ext`. Nothing goes directly into `C:\Claude`.
