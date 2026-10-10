#!/bin/sh
# Downloads the latest published GTFS snapshot from this repo's releases
# into data/gtfs (what the routing build reads). Needs the GitHub CLI.
set -eu
TAG="${GTFS_TAG:-gtfs-latest}"
rm -rf data/gtfs && mkdir -p data
gh release download "$TAG" -p GTFS.zip -p manifest.json -D data --clobber
unzip -q data/GTFS.zip -d data/gtfs
echo "GTFS from release $TAG extracted to data/gtfs"
