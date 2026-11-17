# Progress

Session log, newest first. Keep the last ~10 entries; roll older ones into the summary. Tasks live in
`feature_list.json`, history in git and `CHANGELOG.md`, decisions in the vault note.

## Earlier (summary)

- 2026-10: the app grew from a prototype to the step-based roadmap (template 0.1.0, decision 0001).
- 2026-11-05: 1.0.0 shipped, all steps to 1.0 done; after that only route quality work (1.0.x).
- 2026-11-06: route quality suite (S040), exact map minutes (S041), feeder ride on the card (S045);
  S042 results sent to Hendrik, S043 and S044 open.
- 2026-11-09: moved to the coding guidelines (feature_list.json, docs/specs, PROGRESS.md, `/task`).

## 2026-11-17 · cloud · no task

- Hendrik added "UI overhaul" to `docs/specs/later.md`; the project is `long-term` in the vault (no work in the
  near future). No open tasks; the pause holds.

## 2026-11-16 · cloud · S065, S068, S067

- S065 cleanup 3 of 3 (#424, 1.1.18): one term per thing in the UI text (de/en), index.html fallbacks equal
  the German strings (new test in `i18n.test.ts`), 5 dead i18n keys removed. Live.
- S068 added and built (#425, 1.1.19): `ubuntu-latest` became 26.04, where Playwright 1.56 cannot install
  WebKit; Hendrik chose pinning `layout.yml` to `ubuntu-24.04` over updating Playwright or dropping the job.
- S067 (#426, 1.1.20): `browser.mjs --base` alternates visits; A/A at 4×, two runs, every p > 0.05 (lowest
  0.06, 4× tap after the network stays noisy). No open tasks left; the pause holds.

## 2026-11-16 · cloud · S064 timings, S067

- S064 browser timings in the cloud (comments on #420): no timing slower beyond noise; Hendrik's local
  first map +300 ms did not reproduce. A 4× "tap after the network" gap (44 → 58 ms) was drift between
  back-to-back blocks of visits: with main and branch visits alternating, 54.5 vs 49.0 ms (p ≈ 0.21).
- S064 `passes: true`, merged (#420) and live as 1.1.17; S067 added (#421): `browser.mjs` should alternate
  main and branch visits under `--base`.

## 2026-11-16 · local · S064

- S064 cleanup 2 of 3 (#420, ~3,000 lines, size accepted): finished benches, dead code, copied constants
  (FASTEST_WALK in raptor.ts, geo helpers) and old file formats (timetable v2, stop list v1, walk.bin v1)
  removed. timetable-build keeps its own great-circle `distanceM` on purpose (geo.ts).
- Local timings on Hendrik's PC were too noisy to decide (an A/A run differed by 160 ms); the cloud timings
  above decided.
- Smoke on this PC needs Chromium; with only Edge installed, a preload that sets playwright's `executablePath`
  to `CHROMIUM` works.

## 2026-11-16 · local · S063 review, S066

- Consistency review (code, UI, docs): S063 docs/repo cleanup shipped as 1.1.15 (#418); S064 (dead code, old
  benches) and S065 (UI wording) added. Hendrik's picks: 3 PRs in order; keep only benches still in use
  (suite, speed, goal, swap, providers, chains); showcase regenerated; Claude picks UI terms, listed in the PR.
- #418 was merged by another (vault wrap-up) session 8 s after it opened, before CI, as a merge commit.
- Main's speed job is red since the 2026-11-16 feed: Alt-Kladow's route-tied timed transfers (bus waits for
  bus, 0 s) became a 0 s footpath between stops 87 m apart. S066 fixed it (#419, 1.1.16): route-tied timed
  transfers left out, change times floored at the straight line at 5 km/h; 671 of 79,353 footpaths slower.
  After the merge the timetable was rebuilt by hand and main's speed job is green again.

## 2026-11-15 · local · S061, S044

- S061 speed probe times the maps with the app's FASTEST_WALK (#414, 1.1.12); `check.mjs` runs the probe as
  `node --import tsx` (the `.bin/tsx` shell script cannot be spawned on Windows).
- S044 built on Hendrik's PC (Node 26 and pnpm via winget/npm, Edge as `CHROMIUM`). The first version made
  the footpath load +58 ms on CI; on Hendrik's choice the chains are built after the first footpath map
  (`chainWalkNetworkInSteps`), load back to +1.2 %. Size accepted (~790 lines).
- Browser timings moved to the cloud: Blender/DaVinci keep the PC at ~74 % CPU, local timings are unusable.

## 2026-11-15 · cloud · S044

- S044 walk on the junction graph (#415, 1.1.13): shape nodes folded into chains, built in the worker after
  the first footpath map; Node all maps 1283 → 1223 ms, on foot every cell and stop as main, by bike 7–238
  cells per start earlier (none later).
- The first browser timings showed the second tap slower: building the chains overwrote the network's fields
  and V8 dropped the optimised walk code (`--trace-deopt`), so the first tap after them ran ~25 ms slower.
  Fixed with a throwaway tap in idle time (`warmTap`). The footpath map's +8 % was noise (same code, the wait
  before the worker starts the map varies 0.1–1.5 s). Shipped on Hendrik's yes.
- S062 LF checkout (#416, 1.1.14): `* text=auto eol=lf`; tested as a fresh clone with `core.autocrlf=true` on
  Linux (Hendrik accepted that as the test). Open tasks: none.
- The stop hook runs `check.sh` while a browser timing runs: it disturbs the timing, and the routing test
  "unpacking in steps" times out under that load (passes alone).

## 2026-11-12 · cloud · S043

- S043 map walk in two passes where every walk has one cap (#412, 1.1.11): on foot heatGrid 455 → ~360 ms in
  Node, every cell equal to `walkFront` (`bench/fringe.ts`); bike to the trains keeps `walkFront` (the bound
  prunes nothing there, so the bike goal was not reached).
- 4× tap-to-trip medians were noisy (bimodal; the tap does not run the changed code); shipped on Hendrik's yes.
- S061 added: the CI speed probe walks 900/1800 s, so it cannot see S043. Open: S044, S061.
- Comparing against main: `git fetch origin main` first; a stale local `origin/main` gave a 1.0.6 base once.

## 2026-11-11 · cloud · S058

- S058 faint network lines by mode (#409, 1.1.8): rail from the city view, tram from 12, bus from 14, built in
  the worker from the hour's routes and lines.bin, each group handed to MapLibre only near its zoom.
- `browser.mjs` also times a second tap and panning. Panning is about one frame slower in the test browser:
  even a one-feature line layer costs that there, and the page's own work is unchanged; shipped on Hendrik's yes.
- Worker bundle budget 37.7 → 39.0 KB (main was already over it, within tolerance). Open: S059, S060, S043, S044.

## 2026-11-11 · cloud · S054, S055, S057

- S054 (snap a place to several paths) built twice and measured, not shipped (decision 0017, #406, 1.1.5):
  place only parts card from map and swap (7.6 % of places); with cells maps +11–14 %. `bench/snapwalks.ts`.
- S055 step-free mode uses trips of unknown access, card names them (#407, 1.1.6): VBB 3+ min better 17.2 % → 8.2 %.
- S057 stop dots from zoom 14, nine big stations named above it (`REGION.hubs`, decision 0018, #408, 1.1.7).
  S060 added (switch for lines and stations). Open: S058, S059, S060, S043, S044.
- Branch pushes after a squash merge: force push is blocked here; merged the old branch with `-s ours` instead.

## 2026-11-10 · cloud · S046–S059

- S046 decision records moved to the vault note (1.0.9, #397). S047/S048/S050 research: add-on layers load only
  when switched on (decision 0013); Cash Group ATMs from OSM, not the banks' finders (0014, 0015).
- S049 ATM layer (1.1.0, #398), S051 closed branches out (1.1.1, #400); nightly `addons-refresh.yml` → `addons-latest`.
  S052 private OSM survey worklist (#401). S042 decided (0016, #402): S053 shorter changes (1.1.2, #403;
  VBB 3+ min better 12.3 % → 6.6 %); S056 download.sh checks files against the release's sha256 (1.1.3, #404).
- Open: S054, S055 (from S042), S057–S059 (stops from street level, faint network lines, ATMs almost always;
  Hendrik's question: keep S/U names in the city view?), S043, S044.
