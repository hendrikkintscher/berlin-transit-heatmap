#!/usr/bin/env bash
# PreToolUse hook on Bash: refuse `gh pr create` unless the branch has the bookkeeping
# and isn't far too big.
#   any PR -> the BOOKKEEPING files changed (default VERSION + CHANGELOG.md: one version per PR)
#   any PR -> at most MAX_PR_LINES changed lines (lock files, generated files and docs excluded)
# Limitation: only PRs opened with the gh CLI are checked (not ones opened via a GitHub connector/MCP).
# Synced from project-templates (sync_template.py): edit only between the local markers below.
MAX_PR_LINES="${MAX_PR_LINES:-800}"
BOOKKEEPING="VERSION CHANGELOG.md"   # empty = no bookkeeping files required
BUMP_HINT="Bump VERSION, add its '## X.Y.Z · YYYY-MM-DD' section to CHANGELOG.md, run scripts/check.sh, commit — then create the PR."
# >>> local: override MAX_PR_LINES, BOOKKEEPING or BUMP_HINT here
BOOKKEEPING="VERSION CHANGELOG.md package.json packages/web/package.json"
BUMP_HINT="Add the entry under '## [Unreleased]' in CHANGELOG.md, run bash scripts/bump.sh (VERSION, both package.json), run scripts/check.sh, commit — then create the PR."
# <<< local

input=$(cat)
printf '%s' "$input" | grep -qE '"command"[[:space:]]*:[[:space:]]*"[^"]*gh pr create' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
base=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)
git rev-parse --verify --quiet "$base" >/dev/null || base=main
changed=$( { git diff --name-only "$base"...HEAD; git diff --name-only HEAD; } 2>/dev/null | sort -u)

missing=()
for f in $BOOKKEEPING; do printf '%s\n' "$changed" | grep -qxF "$f" || missing+=("$f"); done
if [ ${#missing[@]} -gt 0 ]; then
  {
    echo "Blocked: this PR is missing bookkeeping: ${missing[*]}"
    echo "$BUMP_HINT"
  } >&2
  exit 2
fi

skip='(^|/)(docs/|\.claude/|\.github/|dist/|build/|vendor/|node_modules/)|(^|/)(CHANGELOG\.md|VERSION|PROGRESS\.md|feature_list\.json)$|(^|/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|flake\.lock)$|\.min\.(js|css)$|\.(snap|generated\.[a-z]+)$'
lines=$(git diff --numstat "$base"...HEAD 2>/dev/null | SKIP="$skip" awk -F'\t' 'BEGIN { re = ENVIRON["SKIP"] } $1 != "-" && $3 !~ re { s += $1 + $2 } END { print s+0 }')
if [ "$lines" -gt "$MAX_PR_LINES" ]; then
  echo "Blocked: this PR changes $lines lines (hard limit $MAX_PR_LINES, lock/generated files excluded). Split the task, or ask the user to raise MAX_PR_LINES." >&2
  exit 2
fi
exit 0
