#!/usr/bin/env bash
# Downloads files of a release through its public download links, which do not count
# against the repository's API budget (1000 calls an hour for the workflow token; one
# `gh release download` call per file used up to 300 of them per deploy).
#
#   scripts/publish/download.sh <tag> <dir> [file…]
#
# Without file names it fetches every .json and .bin file of the release (one API call
# per 100 files to list them), or those whose names match DOWNLOAD_ONLY (an extended
# regular expression) when it is set.
#
# With a token (GH_TOKEN or GITHUB_TOKEN) every file is then checked against the sha256 the
# release API gives for it (S056): right after a build swaps in a fresh release, the download
# links can still serve the previous files for a moment. Stale files are fetched again every
# DOWNLOAD_WAIT seconds (default 15), DOWNLOAD_TRIES times (default 12); if they are still
# old, the script fails rather than hand on yesterday's data. Without a token the files are
# not checked (local use) unless DOWNLOAD_CHECK=1.
set -euo pipefail
: "${GITHUB_REPOSITORY:?must be set}"
tag=$1
dir=$2
shift 2
mkdir -p "$dir"
base="https://github.com/$GITHUB_REPOSITORY/releases/download/$tag"
here=$(dirname "$0")
check=
if [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then check=1; fi
# DOWNLOAD_CHECK=1 checks with gh's own login, DOWNLOAD_CHECK=0 skips the check.
case "${DOWNLOAD_CHECK:-}" in 1) check=1 ;; 0) check= ;; esac

# The release's files with their sha256, as the API lists them (one call per 100 files).
assets="$dir/.assets.json"
if [ $# -eq 0 ] || [ -n "$check" ]; then
  id=$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$tag" --jq .id)
  echo '[]' >"$assets"
  for page in $(seq 1 20); do
    batch=$(gh api "repos/$GITHUB_REPOSITORY/releases/$id/assets?per_page=100&page=$page" \
      --jq '[.[] | {name, digest}]')
    [ "$batch" != "[]" ] || break
    jq -s 'add' "$assets" - <<<"$batch" >"$assets.next" && mv "$assets.next" "$assets"
  done
fi
if [ $# -eq 0 ]; then
  mapfile -t files < <(jq -r '.[].name' "$assets" | grep -E "${DOWNLOAD_ONLY:-\.(json|bin)\$}")
  set -- "${files[@]}"
fi
[ $# -gt 0 ] || { echo "download.sh: no files to fetch from $tag" >&2; exit 1; }

# Each file lands under its own name only when complete: a failed fetch leaves no half file.
fetch() {
  # shellcheck disable=SC2016 # the inner sh expands $1-$3, not this one
  printf '%s\n' "$@" | xargs -P 8 -I{} sh -c \
    'curl -fsSL --retry 3 -o "$1/$2.part" "$3/$2" && mv "$1/$2.part" "$1/$2"' _ "$dir" {} "$base"
}
fetch "$@"
echo "Downloaded $# files from $tag"

if [ -n "$check" ]; then
  tries=${DOWNLOAD_TRIES:-12}
  for try in $(seq 1 "$tries"); do
    mapfile -t old < <(node "$here/verify.mjs" "$dir" "$assets" "$@")
    if [ "${#old[@]}" -eq 0 ]; then
      echo "Checked $# files against the release's sha256"
      break
    fi
    if [ "$try" -eq "$tries" ]; then
      echo "download.sh: ${#old[@]} files from $tag are still not the release's current ones (e.g. ${old[0]})" >&2
      rm -f "$assets"
      exit 1
    fi
    echo "${#old[@]} files are not the release's current ones yet (e.g. ${old[0]}); fetching them again in ${DOWNLOAD_WAIT:-15} s"
    sleep "${DOWNLOAD_WAIT:-15}"
    fetch "${old[@]}"
  done
fi
rm -f "$assets"
