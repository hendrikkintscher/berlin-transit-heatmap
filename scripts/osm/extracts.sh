#!/usr/bin/env bash
# bash scripts/osm/extracts.sh <dir> <extract>...   e.g. work berlin brandenburg
# Downloads Geofabrik's Germany extracts into <dir>/<extract>.osm.pbf and merges them into
# <dir>/merged.osm.pbf, one version of each object (used by addons-refresh.yml and osm-refresh.yml).
set -euo pipefail
dir="${1:?usage: extracts.sh <dir> <extract>...}"; shift
[ "$#" -gt 0 ] || { echo "usage: extracts.sh <dir> <extract>..." >&2; exit 1; }
mkdir -p "$dir"

for region in "$@"; do
  # --retry-all-errors: plain --retry gives up at once on a refused connection (curl exit 7)
  # and on a 404 while Geofabrik swaps in the night's file; both broke the nightly run.
  curl -fsSL --connect-timeout 30 --retry 6 --retry-delay 30 --retry-all-errors \
    -o "$dir/$region.osm.pbf.part" \
    "https://download.geofabrik.de/europe/germany/$region-latest.osm.pbf"
  mv "$dir/$region.osm.pbf.part" "$dir/$region.osm.pbf"
done

files=()
for region in "$@"; do files+=("$dir/$region.osm.pbf"); done
# The extracts overlap at their border and can be cut on different days, so one object can come
# in two versions; merge keeps both and later osmium commands stop at "Node ID twice in input".
# time-filter reads the merge as history and keeps the newest version of each object.
osmium merge -O "${files[@]}" -o "$dir/merged-history.osm.pbf"
osmium time-filter -O "$dir/merged-history.osm.pbf" -o "$dir/merged.osm.pbf"
rm "$dir/merged-history.osm.pbf"
ls -la "$dir"
