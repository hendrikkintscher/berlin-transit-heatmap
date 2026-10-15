# Working on this repo

Berlin transit heatmap, live at https://hendrikkintscher.github.io/berlin-transit-heatmap/.
Start with [README.md](README.md), then [ROADMAP.md](ROADMAP.md): its "How to use this roadmap"
section is the working agreement with Hendrik.

## How a step goes

- Hendrik picks one roadmap step; build only that one, never the next.
- One PR per step: bump the version in both `package.json` and `packages/web/package.json`
  (the merge is tagged `vX.Y.Z` automatically), remove the step from ROADMAP.md and bump its
  `V1.x`, add the app-version row and the roadmap-version line to CHANGELOG.md, run
  `npx prettier --write` on the changed docs.
- Steps marked "decision" (or "Hendrik gets the numbers"): measure, report a short table and a
  recommendation, and wait for his yes before building.
- Things noticed on the way go under "## Inbox" in ROADMAP.md, one dated line each
  ("2026-10-15 (from 0.13.6): …"), and end the PR description as a "For the roadmap Inbox" list.
- Get CI green (`check`, `smoke`, `speed`), merge (squash; merging deploys to Pages), then check
  the live site.

## Speed comes first

Nothing may slow taps or the first map. Report timings before/after at phone size 360×740,
also with the page CPU slowed 4× (CDP `Emulation.setCPUThrottlingRate`; Chrome cannot slow
the worker). A useful setup: build `packages/web/dist` for main and for the branch, serve each
locally with `/data/berlin/*` fetched from the live site (cached), block other hosts and give
MapLibre a blank style, and time a fresh visit: first map (worker 'result' message), tap to
trip on the card, ⇅, moving the rings. Medians of 6–8 visits; 4× first-map times are bimodal.
The CI speed job checks bundle sizes (`scripts/speed/budget.json`) and Node map timings;
raising a budget is a deliberate edit with the reason in the PR.

## Commands

```sh
pnpm check                                   # lint, format, typecheck, all tests
pnpm --dir packages/web build                # -> packages/web/dist
node scripts/smoke/smoke.mjs                 # browser smoke test (as CI)
node scripts/speed/check.mjs --data packages/routing/.data [--base <main checkout>]
pnpm --dir packages/routing fetch-data       # real timetable + walk.bin into packages/routing/.data
```

Benchmarks on the real data live in `packages/routing/bench/` (`swap.ts`: same trip from
both ends; `goal.ts`: map to a Ziel leaving at a time). The release downloads are public: if
`fetch-data` gets a 401, run it without `GITHUB_TOKEN`/`GH_TOKEN`. The GTFS feed is the
release `gtfs-latest` (`GTFS.zip`); `node packages/timetable-build/bin/build-timetable.js
--gtfs data/gtfs --out <dir>` builds all hourly files in about 30 s.

The cloud session hook (`.claude/hooks/session-start.sh`) installs the packages and fetches
the bench data.
