#!/usr/bin/env bash
# SessionStart hook: stdout is added to Claude's context.
# Cheap snapshot of open tasks and the last session, so Claude doesn't read the whole repo.
ROOT="${CLAUDE_PROJECT_DIR:-.}"

echo "## Project status — app $(tr -d '\r\n' < "$ROOT/VERSION" 2>/dev/null)"

PY=""
for p in python3 py python; do
  if "$p" -c "" >/dev/null 2>&1; then PY="$p"; break; fi
done
if [ -n "$PY" ] && [ -f "$ROOT/feature_list.json" ]; then
  "$PY" - "$ROOT/feature_list.json" <<'EOF' 2>/dev/null || echo "feature_list.json: could not be read"
import json, sys
fs = json.load(open(sys.argv[1], encoding="utf-8"))["features"]
done = {f["id"] for f in fs if f.get("passes")}
order = {"high": 0, "medium": 1, "low": 2}
open_ = sorted((f for f in fs if not f.get("passes")), key=lambda f: order.get(f.get("priority"), 3))
print(f"Open tasks: {len(open_)} (top 8 by priority; full list in feature_list.json)")
for f in open_[:8]:
    blocked = [d for d in f.get("deps", []) if d not in done]
    note = f"  [needs {', '.join(blocked)}]" if blocked else ""
    print(f"- {f.get('id')} · {f.get('owner')} · {f.get('priority')} · {f.get('size')} · {f.get('title')}{note}")
EOF
fi

last=$(grep -m1 -E '^## [0-9]{4}-[0-9]{2}-[0-9]{2}' "$ROOT/PROGRESS.md" 2>/dev/null)
[ -n "$last" ] && echo "Last session in PROGRESS.md: ${last#\#\# }"
echo "Reminder: work only on the task named for this thread; ask before starting any other task."

# Unfilled template placeholders mean Claude doesn't know how to build/test this project.
if grep -qE '<(Project name|start command)>' "$ROOT/CLAUDE.md" 2>/dev/null \
   || grep -qE '^(TEST_CMD|LINT_CMD)=""' "$ROOT/scripts/check.sh" 2>/dev/null; then
  echo
  echo "Setup incomplete: CLAUDE.md commands and/or TEST_CMD/LINT_CMD in scripts/check.sh are still placeholders."
  echo "Tell the user once, early, and offer to fill them in from the codebase."
fi
exit 0
