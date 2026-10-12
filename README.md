# Berlin transit heatmap

How long does it take to get from one point in Berlin to everywhere else by public transport? Pick a start point and the map colours the city by travel time, with the finest bands between 20 and 50 minutes, and shows which lines the fastest trips rely on.

There are two modes:

- **Day:** the fastest trip departing between 10:00 and 12:00.
- **Night:** the fastest trip departing between 02:00 and 04:00.

Travel times include walking to the first stop and from the last stop. Everything runs in the browser, with no server to maintain, so the routing core can later be reused in a mobile app.

## Status

Working towards an alpha. Done so far: the GTFS refresh and the timetable build (`packages/timetable-build`). The routing core (`packages/routing`) and the web app (`packages/web`) come next.

## Development

Node 22 and pnpm (via `corepack enable`).

```sh
pnpm install
pnpm check            # lint, format check, typecheck, tests
pnpm build-timetable --gtfs data/GTFS.zip --out work/out
```

### Speed budget

Snappiness is the app's main feature, so CI checks it on every pull request (job `speed`):
each gzipped JS and CSS file must stay within `scripts/speed/budget.json`, and the
map computation, timetable loading and timetable file size, measured on the real data,
must not be worse than on main. A deliberate size increase raises the budget in the same
pull request (`node scripts/speed/check.mjs --write` after `pnpm --dir packages/web build`).
Locally: `node scripts/speed/check.mjs --data <dir with timetable-weekday-10.bin and walk.bin> [--base <checkout of main>]`.

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

### Timetable build

[`.github/workflows/build-timetable.yml`](.github/workflows/build-timetable.yml) runs after every successful refresh and by hand. It turns `gtfs-latest` into `timetable-day.json`, `timetable-night.json`, `stops.json` and `build-info.json` (see [`packages/timetable-build`](packages/timetable-build/README.md)) and publishes them on the release `timetable-latest`, which the web app deploy picks up.

### Using the data locally

With the [GitHub CLI](https://cli.github.com/) installed and logged in:

```sh
npm run gtfs:fetch    # downloads gtfs-latest into data/gtfs
npm run gtfs:verify   # re-runs the checks locally
```

Set `GTFS_TAG=gtfs-2026-10-02` (for example) to fetch a specific snapshot instead.

## Layout

```
.github/workflows/         CI, monthly GTFS refresh, timetable build
scripts/gtfs/              download and verification scripts
packages/timetable-build/  GTFS -> compact timetable files
packages/routing/          RAPTOR engine and heatmap grid (coming next)
packages/web/              web app (coming next)
```

## Licence

Timetable data © VBB Verkehrsverbund Berlin-Brandenburg GmbH, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
