#!/usr/bin/env bash
# The project's pass/fail check. Used by Claude, the Stop hook and CI.
# The same as `pnpm check`: lint, format check, typecheck, then all tests.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}" || exit 1

TEST_CMD="pnpm test"
LINT_CMD="pnpm lint && pnpm format:check && pnpm typecheck"

if [ -z "$TEST_CMD$LINT_CMD" ]; then
  echo "scripts/check.sh: no TEST_CMD/LINT_CMD configured yet — nothing checked." >&2
  exit 0
fi

fail=0
for c in "$LINT_CMD" "$TEST_CMD"; do
  [ -z "$c" ] && continue
  echo "\$ $c"
  bash -c "$c" || { echo "FAILED: $c"; fail=1; }
done
exit $fail
