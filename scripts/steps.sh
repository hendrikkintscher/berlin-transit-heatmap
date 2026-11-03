#!/usr/bin/env bash
# Roadmap steps over docs/steps/*.md frontmatter. Works in Git Bash on Windows (no jq/Node).
#
#   scripts/steps.sh list [status|all] [tag]     open steps; optional tag filter (fix, P1, XS, ...)
#   scripts/steps.sh next                        first open (not doing/waiting), unblocked step in ROADMAP.md order
#   scripts/steps.sh show NNN                    print one step
#   scripts/steps.sh new "Title" [build|decision] [kind=..] [priority=..] [size=..] [needs=S002,S003]
#   scripts/steps.sh tag NNN key=value ...       change kind / priority / size / needs (updates ROADMAP.md)
#   scripts/steps.sh set NNN <status>            open | doing | waiting | done
#   scripts/steps.sh done NNN                    archive step and remove it from ROADMAP.md
#   scripts/steps.sh bump [patch|minor|major]    bump VERSION and both package.json files, turn CHANGELOG
#                                                "Unreleased" into that version (patch: a step; minor: a new milestone)
#
# Tags:  kind     feature | fix | refactor | chore | research   (research = decision steps)
#        priority P1 (must) | P2 (should) | P3 (could)
#        size     XS (few lines) | S (< half a day) | M (~1 day, ~400 lines) | L (too big: split first)
#        needs    step ids that must be finished first, or -
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DIR="$ROOT/docs/steps"
ARCHIVE="$DIR/archive"
ROADMAP="$ROOT/ROADMAP.md"
mkdir -p "$ARCHIVE"

die() { echo "$*" >&2; exit 1; }

field() { # field <file> <key>
  awk -v k="$2" '
    { sub(/\r$/, "") }
    NR==1 && $0=="---" { infm=1; next }
    infm && $0=="---" { exit }
    infm && index($0, k":")==1 { v=substr($0, length(k)+2); sub(/^[ \t]+/, "", v); sub(/[ \t]+#.*$/, "", v); print v; exit }
  ' "$1"
}

pad() { local n="${1#S}"; printf "%03d" "$((10#$n))"; }

find_step() { # find_step NNN|SNNN -> path (active or archived)
  local id f; id=$(pad "$1")
  for f in "$DIR/$id"-*.md "$ARCHIVE/$id"-*.md; do
    [ -e "$f" ] && { echo "$f"; return 0; }
  done
  echo "No step S$id" >&2; return 1
}

set_field() { # set_field file key value  (adds the key if missing)
  local tmp; tmp=$(mktemp)
  awk -v k="$2" -v v="$3" '
    { sub(/\r$/, "") }
    NR==1 && $0=="---" { infm=1; print; next }
    infm && $0=="---" { if (!done) print k ": " v; infm=0 }
    infm && index($0, k":")==1 { print k ": " v; done=1; next }
    { print }
  ' "$1" > "$tmp" && mv "$tmp" "$1"
}

check_tag() { # check_tag key value
  case "$1=$2" in
    kind=feature|kind=fix|kind=refactor|kind=chore|kind=research) ;;
    priority=P1|priority=P2|priority=P3) ;;
    size=XS|size=S|size=M|size=L) ;;
    needs=-) ;;
    needs=*) [[ "$2" =~ ^S[0-9]{3}(,S[0-9]{3})*$ ]] || die "needs must look like S002 or S002,S003" ;;
    *) die "invalid tag $1=$2 (see scripts/steps.sh header)" ;;
  esac
}

is_finished() { # is_finished SNNN
  local f; f=$(find_step "$1" 2>/dev/null) || return 1
  case "$f" in "$ARCHIVE"/*) return 0 ;; esac
  [ "$(field "$f" status)" = "done" ]
}

blockers() { # blockers file -> unfinished needed ids
  local n out=() id; n=$(field "$1" needs)
  [ -z "$n" ] || [ "$n" = "-" ] && return 0
  IFS=, read -ra ids <<<"$n"
  for id in "${ids[@]}"; do is_finished "$id" || out+=("$id"); done
  echo "${out[*]:-}"
}

roadmap_line() { # roadmap_line file
  local f="$1" n line
  n=$(field "$f" needs)
  line="- S$(field "$f" id) · $(field "$f" type) · $(field "$f" kind) · $(field "$f" priority) · $(field "$f" size)"
  [ -n "$n" ] && [ "$n" != "-" ] && line="$line · needs ${n//,/, }"
  echo "$line · $(field "$f" title)"
}

roadmap_ids() { # step ids in roadmap order (first id on each "- S###" line)
  [ -f "$ROADMAP" ] || return 0
  awk '{ sub(/\r$/, "") } /^- S[0-9][0-9][0-9]/ { print substr($2, 2, 3) }' "$ROADMAP"
}

roadmap_replace() { # roadmap_replace id newline|"" (empty = delete)
  [ -f "$ROADMAP" ] || return 0
  local tmp; tmp=$(mktemp)
  awk -v id="S$1" -v nl="$2" '
    { sub(/\r$/, "") }
    /^- S[0-9][0-9][0-9]/ && $2 == id { if (nl != "") print nl; next }
    { print }
  ' "$ROADMAP" > "$tmp" && mv "$tmp" "$ROADMAP"
}

row() {
  local b; b=$(blockers "$1")
  printf "S%s  %-8s %-8s %-8s %-2s %-2s %s%s\n" "$(field "$1" id)" "$(field "$1" type)" "$(field "$1" status)" \
    "$(field "$1" kind)" "$(field "$1" priority)" "$(field "$1" size)" "$(field "$1" title)" "${b:+  [blocked by $b]}"
}

cmd="${1:-list}"; shift || true
case "$cmd" in
  list)
    want="${1:-open}"; tagf="${2:-}"
    case "$want" in open|all|doing|waiting|done) ;; *) tagf="$want"; want=open ;; esac
    shopt -s nullglob
    files=("$DIR"/[0-9]*.md)
    { [ "$want" = "all" ] || [ "$want" = "done" ]; } && files+=("$ARCHIVE"/[0-9]*.md)
    for f in "${files[@]}"; do
      st=$(field "$f" status)
      case "$want" in
        open) [ "$st" = "done" ] && continue ;;
        all) ;;
        *) [ "$st" = "$want" ] || continue ;;
      esac
      if [ -n "$tagf" ]; then
        tags=" $(field "$f" kind) $(field "$f" priority) $(field "$f" size) $(field "$f" type) $(field "$f" needs | tr ',' ' ') "
        [[ "$tags" == *" $tagf "* ]] || continue
      fi
      row "$f"; found=1
    done
    [ -n "${found:-}" ] || echo "(no steps)"
    ;;
  next)
    blocked=()
    for id in $(roadmap_ids); do
      f=$(find_step "$id" 2>/dev/null) || continue
      case "$f" in "$ARCHIVE"/*) continue ;; esac
      case "$(field "$f" status)" in done|doing|waiting) continue ;; esac   # those are shown separately
      b=$(blockers "$f")
      if [ -n "$b" ]; then blocked+=("S$id (needs $b)"); continue; fi
      row "$f"
      [ ${#blocked[@]} -gt 0 ] && echo "  skipped, blocked: ${blocked[*]}"
      exit 0
    done
    echo "(no open, unblocked steps)"
    [ ${#blocked[@]} -gt 0 ] && echo "  blocked: ${blocked[*]}"
    exit 0
    ;;
  show)
    cat "$(find_step "$1")"
    ;;
  new)
    title="${1:?usage: steps.sh new \"Title\" [build|decision] [kind=..] [priority=..] [size=..] [needs=..]}"; shift
    type=build
    if [ $# -gt 0 ] && [[ "$1" != *=* ]]; then type="$1"; shift; fi
    case "$type" in build|decision) ;; *) die "type must be build or decision" ;; esac
    kind=feature; [ "$type" = decision ] && kind=research
    priority=P2; size=S; needs=-
    for kv in "$@"; do
      k="${kv%%=*}"; v="${kv#*=}"; check_tag "$k" "$v"
      case "$k" in kind) kind=$v ;; priority) priority=$v ;; size) size=$v ;; needs) needs=$v ;; esac
    done
    [ "$type" = decision ] && [ "$kind" != research ] && die "decision steps have kind=research"
    [ "$type" = build ] && [ "$kind" = research ] && die "kind=research is only for decision steps"
    last=$( (ls "$DIR" "$ARCHIVE" 2>/dev/null | grep -oE '^[0-9]{3}' || true) | sort -n | tail -1)
    id=$(pad $(( 10#${last:-0} + 1 )))
    slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g' | cut -c1-40)
    out="$DIR/$id-$slug.md"
    esc=$(printf '%s' "$title" | sed 's/[&/\]/\\&/g')
    sed -e "s/{{ID}}/$id/" -e "s/{{TITLE}}/$esc/" -e "s/{{TYPE}}/$type/" -e "s/{{KIND}}/$kind/" \
        -e "s/{{PRIORITY}}/$priority/" -e "s/{{SIZE}}/$size/" -e "s/{{NEEDS}}/$needs/" "$DIR/_template.md" > "$out"
    if [ -f "$ROADMAP" ]; then   # append at the end of the "## Steps" section
      tmp=$(mktemp)
      awk -v line="$(roadmap_line "$out")" '
        { sub(/\r$/, "") }
        /^## Steps/ { insteps=1; print; next }
        insteps && /^## / { print line; print ""; insteps=0; added=1 }
        insteps && /^[[:space:]]*$/ { blank++; next }
        insteps { while (blank>0) { print ""; blank-- } }
        { print }
        END { if (insteps && !added) print line }
      ' "$ROADMAP" > "$tmp" && mv "$tmp" "$ROADMAP"
    fi
    echo "${out#"$ROOT"/}  (added to ROADMAP.md)"
    [ "$type" = build ] && [ "$size" = L ] && echo "Note: size L — split this into smaller steps before it can start."
    exit 0
    ;;
  tag)
    f=$(find_step "${1:?usage: steps.sh tag NNN key=value ...}"); id=$(pad "$1"); shift
    [ $# -gt 0 ] || die "give at least one key=value"
    for kv in "$@"; do k="${kv%%=*}"; v="${kv#*=}"; check_tag "$k" "$v"; set_field "$f" "$k" "$v"; done
    roadmap_replace "$id" "$(roadmap_line "$f")"
    row "$f"
    ;;
  set)
    f=$(find_step "$1"); st="${2:?status}"
    case "$st" in open|doing|waiting|done) ;; *) die "status: open | doing | waiting | done" ;; esac
    if [ "$st" = doing ]; then
      [ "$(field "$f" type)" = build ] && [ "$(field "$f" size)" = L ] && \
        die "S$(pad "$1") is size L. Propose a split into smaller steps (XS/S/M) first."
      b=$(blockers "$f"); [ -n "$b" ] && die "S$(pad "$1") is blocked by: $b"
    fi
    set_field "$f" status "$st"; echo "S$(pad "$1") -> $st"
    ;;
  done)
    f=$(find_step "$1"); id=$(pad "$1")
    set_field "$f" status done
    case "$f" in "$ARCHIVE"/*) ;; *) mv "$f" "$ARCHIVE/" ;; esac
    roadmap_replace "$id" ""
    echo "S$id -> done (archived, removed from ROADMAP.md)"
    ;;
  bump)
    part="${1:-patch}"; vf="$ROOT/VERSION"; cl="$ROOT/CHANGELOG.md"
    cur=$(tr -d ' \r\n' < "$vf" 2>/dev/null || echo 0.0.0)
    IFS=. read -r ma mi pa <<<"$cur"
    case "$part" in
      major) ma=$((ma+1)); mi=0; pa=0 ;;
      minor) mi=$((mi+1)); pa=0 ;;
      patch) pa=$((pa+1)) ;;
      *) die "bump patch|minor|major" ;;
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
    ;;
  *)
    sed -n '2,17p' "$0"; exit 1 ;;
esac
