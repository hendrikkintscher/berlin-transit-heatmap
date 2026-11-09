#!/usr/bin/env bash
# bash scripts/bump.sh [patch|minor|major]   (default patch; minor for a new milestone)
# Bumps VERSION and both package.json files, and turns CHANGELOG.md's "## [Unreleased]" entries
# into the new version's section. Works in Git Bash on Windows (no jq/Node).
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
part="${1:-patch}"; vf="$ROOT/VERSION"; cl="$ROOT/CHANGELOG.md"
cur=$(tr -d ' \r\n' < "$vf" 2>/dev/null || echo 0.0.0)
IFS=. read -r ma mi pa <<<"$cur"
case "$part" in
  major) ma=$((ma+1)); mi=0; pa=0 ;;
  minor) mi=$((mi+1)); pa=0 ;;
  patch) pa=$((pa+1)) ;;
  *) echo "usage: bash scripts/bump.sh [patch|minor|major]" >&2; exit 1 ;;
esac
new="$ma.$mi.$pa"; echo "$new" > "$vf"
# The app version also lives in both package.json files: packages/web's is shown in the
# Mehr menu and tagged vX.Y.Z on merge (.github/workflows/tag-version.yml).
for pj in "$ROOT/package.json" "$ROOT/packages/web/package.json"; do
  [ -f "$pj" ] || continue
  tmp=$(mktemp)
  awk -v v="$new" '!x && /^  "version": "/ { sub(/"version": "[^"]*"/, "\"version\": \"" v "\""); x=1 } { print }' "$pj" > "$tmp" && mv "$tmp" "$pj"
done
if [ -f "$cl" ] && grep -q '^## \[Unreleased\]' "$cl"; then
  tmp=$(mktemp)
  awk -v v="$new" -v d="$(date +%Y-%m-%d)" '
    { sub(/\r$/, "") }
    /^## \[Unreleased\]/ && !x { print "## [Unreleased]"; print ""; print "## [" v "] — " d; x=1; next }
    { print }
  ' "$cl" > "$tmp" && mv "$tmp" "$cl"
  echo "VERSION $cur -> $new; CHANGELOG 'Unreleased' entries now under [$new]"
else
  echo "VERSION $cur -> $new (no '## [Unreleased]' section in CHANGELOG.md — add the entry by hand)"
fi
