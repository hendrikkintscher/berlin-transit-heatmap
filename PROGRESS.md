# Progress

Session log, newest first. Keep the last ~10 entries; roll older ones into the summary. Tasks live in
`feature_list.json`, history in git and `CHANGELOG.md`, decisions in the vault note.

## Earlier (summary)

- 2026-10: the app grew from a prototype to the step-based roadmap (template 0.1.0, decision 0001).
- 2026-11-05: 1.0.0 shipped, all steps to 1.0 done; after that only route quality work (1.0.x).
- 2026-11-06: route quality suite (S040), exact map minutes (S041), feeder ride on the card (S045);
  S042 results sent to Hendrik, S043 and S044 open.

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

## 2026-11-09 · local · coding guidelines

- Moved to the coding guidelines (claude-brain `setup/coding-guidelines.md`), like claude-project-template 0.2.x:
  ROADMAP.md and docs/steps/ became `feature_list.json` (S042, S043, S044, S046) and docs/specs/; this log
  added; `scripts/steps.sh` replaced by `scripts/bump.sh`; `/step` and `/handoff` replaced by `/task`.
- Decisions stay in `docs/decisions/` until the vault audit is done, then S046 moves them to the vault note.
- Next: S042 waits for Hendrik's yes; S043 and S044 only when Hendrik names them.
