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
set -euo pipefail
: "${GITHUB_REPOSITORY:?must be set}"
tag=$1
dir=$2
shift 2
mkdir -p "$dir"
base="https://github.com/$GITHUB_REPOSITORY/releases/download/$tag"
if [ $# -eq 0 ]; then
  id=$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$tag" --jq .id)
  files=()
  for page in $(seq 1 20); do
    batch=$(gh api "repos/$GITHUB_REPOSITORY/releases/$id/assets?per_page=100&page=$page" --jq '.[].name')
    [ -n "$batch" ] || break
    mapfile -t -O "${#files[@]}" files <<<"$batch"
  done
  mapfile -t files < <(printf '%s\n' "${files[@]}" | grep -E "${DOWNLOAD_ONLY:-\.(json|bin)\$}")
  set -- "${files[@]}"
fi
[ $# -gt 0 ] || { echo "download.sh: no files to fetch from $tag" >&2; exit 1; }
# Each file lands under its own name only when complete: a failed fetch leaves no half file.
# shellcheck disable=SC2016 # the inner sh expands $1-$3, not this one
printf '%s\n' "$@" | xargs -P 8 -I{} sh -c \
  'curl -fsSL --retry 3 -o "$1/$2.part" "$3/$2" && mv "$1/$2.part" "$1/$2"' _ "$dir" {} "$base"
echo "Downloaded $# files from $tag"
