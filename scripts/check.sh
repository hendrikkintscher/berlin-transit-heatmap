#!/usr/bin/env bash
# The project's pass/fail check. Used by Claude, the Stop hook and CI.
# 1. Bookkeeping (scripts/check.py): feature_list.json, PROGRESS.md, VERSION vs CHANGELOG, local links.
# 2. The same as `pnpm check`: lint, format check, typecheck, then all tests.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}" || exit 1

TEST_CMD="pnpm test"
LINT_CMD="pnpm lint && pnpm format:check && pnpm typecheck"

PY=""
for p in python3 py python; do   # on Windows python/python3 may be Store stubs that fail; py works
  if "$p" -c "" >/dev/null 2>&1; then PY="$p"; break; fi
done

fail=0
if [ -n "$PY" ]; then
  "$PY" scripts/check.py || fail=1
else
  echo "scripts/check.sh: no working python found, bookkeeping not checked"; fail=1
fi
for c in "$LINT_CMD" "$TEST_CMD"; do
  [ -z "$c" ] && continue
  echo "\$ $c"
  bash -c "$c" || { echo "FAILED: $c"; fail=1; }
done
exit $fail
