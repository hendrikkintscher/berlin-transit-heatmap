#!/usr/bin/env bash
# Keeps planning files from sprawling. Registered for PreToolUse (Write) and PostToolUse (Edit|Write).
# Exit 2 + stderr = Claude sees the message (PreToolUse: the write is blocked).
# No jq needed, so it runs in plain Git Bash on Windows.
ROOT="${CLAUDE_PROJECT_DIR:-.}"
MAX_ROADMAP_LINES=80

input=$(cat)
get() { printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1; }
event=$(get hook_event_name); tool=$(get tool_name)
path=$(get file_path | sed -e 's#\\#/#g' -e 's#//*#/#g')   # C:\\a\\b -> C:/a/b
name=$(basename "$path")

if [ "$event" = "PreToolUse" ] && [ "$tool" = "Write" ]; then
  [ -e "$path" ] && exit 0                              # overwriting an existing file is fine
  case "$path" in */docs/steps/*|*/docs/decisions/*|*/docs/specs/*|*/docs/handoff.md|*/.claude/*) exit 0 ;; esac
  # Block only names that look like Claude's typical scratch/planning files; real docs are fine.
  upper=$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')
  case "$upper" in
    *.MD|*.TXT) ;;
    *) exit 0 ;;
  esac
  case "$upper" in
    TODO*|NOTES*|NOTE.*|PLAN*|PROGRESS*|STATUS*|*SUMMARY*|IMPLEMENTATION*|NEXT*STEPS*|ROADMAP?*|TASKS*|CHANGES.*|WORKLOG*|SCRATCH*|SESSION*)
      {
        echo "Blocked: '$name' looks like a planning/notes file outside the planning system."
        echo "Steps -> scripts/steps.sh new; decisions -> docs/decisions/; specs -> docs/specs/;"
        echo "session notes -> docs/handoff.md; implementation details -> commit message. Ask the user if it's really needed."
      } >&2
      exit 2 ;;
  esac
  exit 0
fi

if [ "$event" = "PostToolUse" ] && [ "$name" = "ROADMAP.md" ]; then
  lines=$(wc -l < "$ROOT/ROADMAP.md" | tr -d ' ')
  if [ "$lines" -gt "$MAX_ROADMAP_LINES" ]; then
    echo "ROADMAP.md is $lines lines (limit $MAX_ROADMAP_LINES). It is an index only: move details into step files or specs, and shorten it now." >&2
    exit 2
  fi
fi
exit 0
