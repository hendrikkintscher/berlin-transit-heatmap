#!/bin/bash
# Claude Code cloud sessions: install the workspace's packages so lint, typecheck,
# tests and builds work, and fetch the real timetable and footpaths the benchmarks
# use (packages/routing/.data; a failed download is not fatal).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
pnpm install --prefer-offline

# The release is public; a session token without access would only get a 401.
(cd packages/routing && env -u GITHUB_TOKEN -u GH_TOKEN pnpm fetch-data) ||
  echo "session-start: bench data not fetched (pnpm --dir packages/routing fetch-data)" >&2
