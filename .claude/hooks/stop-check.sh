#!/usr/bin/env bash
# Stop hook: when Claude tries to finish a turn with uncommitted code changes, run scripts/check.sh.
# If it fails, exit 2 sends Claude back to fix it (stderr = the failing output).
# Turns that only talked, or only touched docs/planning files, are not checked.
ROOT="${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

changed=$(git status --porcelain 2>/dev/null | awk '{print $NF}' \
  | grep -vE '^(docs/|ROADMAP\.md$|CHANGELOG\.md$|VERSION$|\.claude/|\.github/|CLAUDE(\.local)?\.md$|README\.md$|TEMPLATE-README\.md$)' || true)
[ -z "$changed" ] && exit 0

out=$(bash scripts/check.sh 2>&1); rc=$?
if [ $rc -ne 0 ]; then
  { echo "scripts/check.sh failed — fix this before finishing:"; printf '%s\n' "$out" | tail -40; } >&2
  exit 2
fi
exit 0
