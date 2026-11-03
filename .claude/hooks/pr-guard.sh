#!/usr/bin/env bash
# PreToolUse hook on Bash: refuse `gh pr create` unless the branch has the step bookkeeping
# and isn't far too big.
#   code changes      -> VERSION + CHANGELOG.md + ROADMAP.md
#   docs-only changes -> ROADMAP.md (e.g. a finished decision step)
#   any PR            -> at most MAX_PR_LINES changed lines (lock files, generated and docs excluded)
# Limitation: only PRs opened with the gh CLI are checked (not ones opened via a GitHub connector/MCP).
MAX_PR_LINES="${MAX_PR_LINES:-800}"

input=$(cat)
printf '%s' "$input" | grep -qE '"command"[[:space:]]*:[[:space:]]*"[^"]*gh pr create' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
base=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)
git rev-parse --verify --quiet "$base" >/dev/null || base=main
changed=$( { git diff --name-only "$base"...HEAD; git diff --name-only HEAD; } 2>/dev/null | sort -u)

meta='^(docs/|ROADMAP\.md$|CHANGELOG\.md$|VERSION$|\.claude/|\.github/|CLAUDE\.md$|README\.md$)'
code=$(printf '%s\n' "$changed" | grep -vE "$meta" | grep -v '^$' || true)

need=(ROADMAP.md); [ -n "$code" ] && need+=(VERSION CHANGELOG.md)
missing=()
for f in "${need[@]}"; do printf '%s\n' "$changed" | grep -qx "$f" || missing+=("$f"); done
if [ ${#missing[@]} -gt 0 ]; then
  {
    echo "Blocked: this PR is missing step bookkeeping: ${missing[*]}"
    echo "CHANGELOG entry under [Unreleased], scripts/steps.sh bump [minor|patch], scripts/steps.sh done NNN, commit — then create the PR."
  } >&2
  exit 2
fi

skip='(^|/)(docs/|\.claude/|\.github/|dist/|build/|vendor/|node_modules/)|(^|/)(ROADMAP\.md|CHANGELOG\.md|VERSION)$|(^|/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|flake\.lock)$|\.min\.(js|css)$|\.(snap|generated\.[a-z]+)$'
lines=$(git diff --numstat "$base"...HEAD 2>/dev/null | awk -F'\t' -v re="$skip" '$1 != "-" && $3 !~ re { s += $1 + $2 } END { print s+0 }')
if [ "$lines" -gt "$MAX_PR_LINES" ]; then
  echo "Blocked: this PR changes $lines lines (hard limit $MAX_PR_LINES, lock/generated files excluded). Split the step, or ask the user to raise MAX_PR_LINES." >&2
  exit 2
fi
exit 0
