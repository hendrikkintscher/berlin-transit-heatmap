# Progress

Session log, newest first. Keep the last ~10 entries; roll older ones into the summary. Tasks live in
`feature_list.json`, history in git and `CHANGELOG.md`, decisions in the vault note.

## Earlier (summary)

- 2026-10: the app grew from a prototype to the step-based roadmap (template 0.1.0, decision 0001).
- 2026-11-05: 1.0.0 shipped, all steps to 1.0 done; after that only route quality work (1.0.x).
- 2026-11-06: route quality suite (S040), exact map minutes (S041), feeder ride on the card (S045);
  S042 results sent to Hendrik, S043 and S044 open.

## 2026-11-10 · cloud · S046–S049

- S046: decision records moved to the vault note (1.0.9, #397).
- S047/S048 (research): add-on layers load only when switched on, after the first map (decision 0013);
  Cash Group ATMs from OpenStreetMap, not the YellowMap-run Cash Group finder (decision 0014).
- S049: ATM add-on layer live in 1.1.0 (#398); nightly `addons-refresh.yml` publishes `atm.json` on `addons-latest`.
- Next: S042 waits for Hendrik's yes; S043 and S044 only when Hendrik names them.

## 2026-11-10 · cloud · S046 decisions to the vault

- The 12 decision records are now one line each in the vault note's `## Decisions` (project-vault eecc152),
  with a pointer to the full records in git (66adaa7); `docs/decisions/` deleted, CLAUDE.md, README and the
  planning guard point to the vault note.
- Next: S042 waits for Hendrik's yes; S043 and S044 only when Hendrik names them.

## 2026-11-09 · local · coding guidelines

- Moved to the coding guidelines (claude-brain `setup/coding-guidelines.md`), like claude-project-template 0.2.x:
  ROADMAP.md and docs/steps/ became `feature_list.json` (S042, S043, S044, S046) and docs/specs/; this log
  added; `scripts/steps.sh` replaced by `scripts/bump.sh`; `/step` and `/handoff` replaced by `/task`.
- Decisions stay in `docs/decisions/` until the vault audit is done, then S046 moves them to the vault note.
- Next: S042 waits for Hendrik's yes; S043 and S044 only when Hendrik names them.
