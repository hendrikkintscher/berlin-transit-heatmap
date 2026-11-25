#!/usr/bin/env bash
# Stop hook: when Claude tries to finish a turn with uncommitted code changes, run scripts/check.sh.
# If it fails, exit 2 sends Claude back to fix it (stderr = the failing output).
# Turns that only talked, or only touched docs/bookkeeping files (SKIP_RE), are not checked.
# Synced from project-templates (sync_template.py): edit only between the local markers below.
SKIP_RE='^(docs/|feature_list\.json$|PROGRESS\.md$|CHANGELOG\.md$|VERSION$|\.claude/|\.github/|CLAUDE(\.local)?\.md$|README\.md$|TEMPLATE-README\.md$)'
# >>> local: override SKIP_RE here
# <<< local
input=$(cat 2>/dev/null || true)
ROOT="${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

changed=$(git status --porcelain 2>/dev/null | awk '{print $NF}' | grep -vE "$SKIP_RE" || true)
[ -z "$changed" ] && exit 0

out=$(bash scripts/check.sh 2>&1); rc=$?
if [ $rc -ne 0 ]; then
  # Claude already went back once for this stop (stop_hook_active): don't loop, tell the person instead.
  if printf '%s' "$input" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
    printf '{"systemMessage": "scripts/check.sh still fails after one fix attempt; the turn ends unchecked. Run it before committing."}\n'
    exit 0
  fi
  { echo "scripts/check.sh failed — fix this before finishing:"; printf '%s\n' "$out" | tail -40; } >&2
  exit 2
fi
exit 0
