#!/usr/bin/env bash
# SessionStart hook: stdout is added to Claude's context.
# Cheap snapshot of open tasks and the last session, so Claude doesn't read the whole repo.
# Synced from project-templates (sync_template.py): edit only between the local markers below.
ROOT="${CLAUDE_PROJECT_DIR:-.}"
REMINDER="Reminder: work only on the task named for this thread; ask before starting any other task."

# Checks run locally, not in GitHub Actions: enable the repo's pre-push hook in this clone.
[ -d "$ROOT/.githooks" ] && git -C "$ROOT" config core.hooksPath .githooks 2>/dev/null

if [ -f "$ROOT/VERSION" ]; then echo "## Project status — app $(tr -d '\r\n' < "$ROOT/VERSION")"
else echo "## Project status — $(git -C "$ROOT" log -1 --format='%h %s' 2>/dev/null)"; fi

PY=""
for p in python3 py python; do
  if "$p" -c "" >/dev/null 2>&1; then PY="$p"; break; fi
done
if [ -n "$PY" ] && [ -f "$ROOT/feature_list.json" ]; then
  "$PY" - "$ROOT/feature_list.json" <<'EOF' 2>/dev/null || echo "feature_list.json: could not be read"
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
fs = data if isinstance(data, list) else data.get("features", data.get("tasks", []))
done = {f["id"] for f in fs if f.get("passes")}
order = {"high": 0, 1: 0, "medium": 1, "normal": 1, 2: 1, 3: 1, "low": 2, 4: 2, 5: 2}
open_ = sorted((f for f in fs if not f.get("passes") and f.get("kind") != "dropped"), key=lambda f: order.get(f.get("priority"), 3))
print(f"Open tasks: {len(open_)} (top 8 by priority; full list in feature_list.json)")
for f in open_[:8]:
    blocked = [d for d in f.get("deps", []) if d not in done]
    note = f"  [needs {', '.join(blocked)}]" if blocked else ""
    print(f"- {f.get('id')} · {f.get('owner')} · {f.get('priority')} · {f.get('size')} · {f.get('title')}{note}")
EOF
fi

last=$(grep -m1 -E '^## [0-9]{4}-[0-9]{2}-[0-9]{2}' "$ROOT/PROGRESS.md" 2>/dev/null)
[ -n "$last" ] && echo "Last session in PROGRESS.md: ${last#\#\# }"

# Unfilled template placeholders mean Claude doesn't know how to build/test this project.
if grep -qE '<(Project name|start command)>' "$ROOT/CLAUDE.md" 2>/dev/null \
   || grep -qE '^(TEST_CMD|LINT_CMD)=""' "$ROOT/scripts/check.sh" 2>/dev/null; then
  echo
  echo "Setup incomplete: CLAUDE.md commands and/or TEST_CMD/LINT_CMD in scripts/check.sh are still placeholders."
  echo "Tell the user once, early, and offer to fill them in from the codebase."
fi
# >>> local: override REMINDER or add this repo's own session-start checks (stdout reaches Claude)
# <<< local
echo "$REMINDER"
exit 0
