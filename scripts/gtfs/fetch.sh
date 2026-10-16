#!/bin/sh
# Downloads the latest published GTFS snapshot from this repo's releases
# into data/gtfs (what the routing build reads). Needs the GitHub CLI.
# Downloads into a temporary folder first: a failed download keeps the old copy.
set -eu
TAG="${GTFS_TAG:-gtfs-latest}"
mkdir -p data
tmp=$(mktemp -d data/.gtfs.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
gh release download "$TAG" -p GTFS.zip -p manifest.json -D "$tmp"
unzip -q "$tmp/GTFS.zip" -d "$tmp/gtfs"
rm -rf data/gtfs
mv "$tmp/gtfs" data/gtfs
mv "$tmp/GTFS.zip" "$tmp/manifest.json" data/
echo "GTFS from release $TAG extracted to data/gtfs"
