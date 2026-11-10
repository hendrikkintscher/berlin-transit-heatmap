#!/usr/bin/env bash
# PreToolUse hook on Write: blocks new scratch/planning files outside the one-home-per-kind system.
# Exit 2 + stderr = Claude sees the message and the write is blocked. No jq needed (plain Git Bash).
input=$(cat)
get() { printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1; }
[ "$(get tool_name)" = "Write" ] || exit 0
path=$(get file_path | sed -e 's#\\#/#g' -e 's#//*#/#g')   # C:\\a\\b -> C:/a/b
name=$(basename "$path")

[ -e "$path" ] && exit 0                                  # overwriting an existing file is fine
case "$path" in */docs/specs/*|*/.claude/*) exit 0 ;; esac

upper=$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')
case "$upper" in
  PROGRESS.MD) exit 0 ;;                                  # the session log itself
  *.MD|*.TXT) ;;
  *) exit 0 ;;
esac
case "$upper" in
  TODO*|NOTES*|NOTE.*|PLAN*|PROGRESS?*|STATUS*|*SUMMARY*|IMPLEMENTATION*|NEXT*STEPS*|ROADMAP*|HANDOVER*|HANDOFF*|TASKS*|CHANGES.*|WORKLOG*|SCRATCH*|SESSION*|DECISION*)
    {
      echo "Blocked: '$name' looks like a planning/notes file outside the system."
      echo "Tasks -> feature_list.json; session log -> PROGRESS.md; history -> CHANGELOG.md + git;"
      echo "decisions -> the vault note (cross-project: the brain); specs -> docs/specs/. Ask the user if it's really needed."
    } >&2
    exit 2 ;;
esac
exit 0
