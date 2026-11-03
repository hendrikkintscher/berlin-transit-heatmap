#!/usr/bin/env bash
# SessionStart hook: stdout is added to Claude's context.
# Cheap snapshot of where the roadmap stands, so Claude doesn't read the whole repo.
ROOT="${CLAUDE_PROJECT_DIR:-.}"
S="$ROOT/scripts/steps.sh"

echo "## Roadmap status — app $(tr -d '\r\n' < "$ROOT/VERSION" 2>/dev/null)"
echo "In progress:";            bash "$S" list doing 2>/dev/null
echo "Waiting for user's yes:"; bash "$S" list waiting 2>/dev/null
echo "Next on the roadmap:";    bash "$S" next 2>/dev/null
echo "Reminder: work only on the step named for this thread; ask before starting any other step."

# Unfilled template placeholders mean Claude doesn't know how to build/test this project.
if grep -qE '<(Project name|install command|run command|test command|single-test command|lint command)>' "$ROOT/CLAUDE.md" 2>/dev/null \
   || grep -qE '^(TEST_CMD|LINT_CMD)=""' "$ROOT/scripts/check.sh" 2>/dev/null; then
  echo
  echo "Setup incomplete: CLAUDE.md commands and/or TEST_CMD/LINT_CMD in scripts/check.sh are still placeholders."
  echo "Tell the user once, early, and offer to fill them in from the codebase."
fi

if [ -s "$ROOT/docs/handoff.md" ]; then
  echo
  echo "A handoff from the previous session exists: read docs/handoff.md before starting."
fi
exit 0
