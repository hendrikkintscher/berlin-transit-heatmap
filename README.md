# Berlin transit heatmap

How long does it take to get from one point in Berlin to everywhere else by public transport? Pick a start point and the map colours the city in 5-minute travel-time bands.

There are two modes:

- **Day:** the fastest trip departing between 10:00 and 12:00.
- **Night:** the fastest trip departing between 02:00 and 04:00.

Travel times include walking to the first stop and from the last stop. Everything runs in the browser, with no server to maintain, so the routing core can later be reused in a mobile app.

## Status

Early setup. So far this repository contains the timetable data pipeline. The routing core (`packages/routing`) and the web app (`packages/web`) come next.

## Timetable data

The timetable is the public [VBB GTFS feed](https://www.vbb.de/vbb-services/api-open-data/datensaetze/), which covers all public transport in Berlin and Brandenburg (U-Bahn, S-Bahn, tram, bus, regional trains and ferries). It is published by Verkehrsverbund Berlin-Brandenburg under CC BY 4.0.

### Monthly refresh

[`.github/workflows/gtfs-refresh.yml`](.github/workflows/gtfs-refresh.yml) runs on the 2nd of every month and can also be started by hand from the Actions tab ("Run workflow"). It:

1. Downloads the current feed from `https://www.vbb.de/vbbgtfs`.
2. Skips publishing if the file is identical to the last published one (unless started with "force").
3. Checks the feed with [`scripts/gtfs/verify.mjs`](scripts/gtfs/verify.mjs): required files and columns are present, row counts are plausible (so a truncated download fails), stops lie in Berlin-Brandenburg, and the service period has not already ended.
4. Publishes `GTFS.zip` and a `manifest.json` (source, SHA-256, size, service period, row counts) as GitHub release assets.

The feed is about 50–100 MB, so it lives in releases rather than in git:

- `gtfs-YYYY-MM-DD` is a dated snapshot, kept so builds can be reproduced.
- `gtfs-latest` always holds the newest verified feed. This is what the routing build uses.

### Using the data locally

With the [GitHub CLI](https://cli.github.com/) installed and logged in:

```sh
npm run gtfs:fetch    # downloads gtfs-latest into data/gtfs
npm run gtfs:verify   # re-runs the checks locally
```

Set `GTFS_TAG=gtfs-2026-10-02` (for example) to fetch a specific snapshot instead.

## Layout

```
.github/workflows/   monthly GTFS refresh
scripts/gtfs/        download and verification scripts
packages/            routing core and web app (coming next)
```

## Licence

Timetable data © VBB Verkehrsverbund Berlin-Brandenburg GmbH, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
