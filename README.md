# Berlin transit heatmap

How long does it take to get from one point in Berlin to everywhere else by public transport? Pick a start point and the map shows the travel time to every spot, with coloured travel times and time rings, and a tap anywhere gives the minutes and the connection there. The app is live as "Wohin jetzt? · Öffis mit einem Tap" at https://hendrikkintscher.github.io/berlin-transit-heatmap/.

Times are for leaving now or at a chosen hour of today, the coming week or a typical weekday or weekend, or for arriving by an hour. Travel times include walking to the first stop and from the last stop along real streets and paths. Everything runs in the browser, with no server to maintain.

## What's in 1.0

- **The map:** pick a start (tap, search, or where you are) and see the travel time to every spot in Berlin as time lines, with colours under Ebenen; on foot to and from stops along real streets and paths.
- **A tap for the trip:** the minutes and the connection to any place (lines, changes, walks, when to leave); ⇅ swaps start and end; press and hold to move the start.
- **Zeit:** now, a chosen hour of today or the coming week, a typical weekday or weekend; leave at or arrive by; next connection, typical (wait included) or best case; compare two times.
- **Unterwegs:** transit, bike + train or bike only; walking speed; step-free trips.
- **Questions on the start card:** "Was erreiche ich in 30 Min.?" (Bis N Min.), "Wo treffen wir uns?" (Treffpunkt for up to five people, with fair suggestions), "Wo soll ich wohnen?" (Wohnlage from your favourite places).
- **Layers:** lines the fastest trips use, departures per hour, transit deserts, places to go (lakes, bathing spots, parks, forests, viewpoints with their minutes).
- **Timetable changes** for the chosen day, from the VBB timetable, refreshed every night.
- **Everyday use:** favourite places, links that open the same map, German and English, installable as an app that works offline; the first map in about a second on a phone-sized screen.

Screenshots and sharepics are in [showcase/](showcase/).

## Packages

- [`packages/timetable-build`](packages/timetable-build/README.md): turns the GTFS feed and OpenStreetMap footpaths into the binary hourly timetables and the walking network.
- [`packages/routing`](packages/routing/README.md): the travel-time engine (range-RAPTOR, footpath walking, heatmap grid). Pure TypeScript, runs in a Web Worker and in Node.
- [`packages/web`](packages/web/README.md): the app (Vite, MapLibre, installable as a PWA).
- Region settings (area, names, data sources) live in [`packages/routing/src/regions.ts`](packages/routing/src/regions.ts).

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
Locally: `node scripts/speed/check.mjs --data <dir with timetable-weekday-10.bin, stoplist.bin and walk.bin> [--base <checkout of main>]`.

## Timetable data

The timetable is the public [VBB GTFS feed](https://www.vbb.de/vbb-services/api-open-data/datensaetze/), which covers all public transport in Berlin and Brandenburg (U-Bahn, S-Bahn, tram, bus, regional trains and ferries). It is published by Verkehrsverbund Berlin-Brandenburg under CC BY 4.0.

### Nightly refresh

[`.github/workflows/gtfs-refresh.yml`](.github/workflows/gtfs-refresh.yml) runs every night and can also be started by hand from the Actions tab ("Run workflow"). It:

1. Downloads the current feed from `https://www.vbb.de/vbbgtfs`.
2. Skips publishing if the file is identical to the last published one (unless started with "force").
3. Checks the feed with [`scripts/gtfs/verify.mjs`](scripts/gtfs/verify.mjs): required files and columns are present, row counts are plausible (so a truncated download fails), stops lie in Berlin-Brandenburg, and the service period has not already ended.
4. Publishes `GTFS.zip` and a `manifest.json` (source, SHA-256, size, service period, row counts) as GitHub release assets.

The feed is about 50–100 MB, so it lives in releases rather than in git:

- `gtfs-YYYY-MM-DD` is a dated snapshot, kept so builds can be reproduced.
- `gtfs-latest` always holds the newest verified feed. This is what the routing build uses.

### Timetable build

[`.github/workflows/build-timetable.yml`](.github/workflows/build-timetable.yml) runs after every successful refresh and by hand. It turns `gtfs-latest` into the hourly binary timetables (`timetable-*.bin`, for typical days and the coming week's dates) with the stops, their station numbers and the footpaths they share (`stoplist.bin`), `walk.bin`, `lines.bin`, `streets.json`, `changes.json` and `build-info.json` (see [`packages/timetable-build`](packages/timetable-build/README.md)) and publishes them on the release `timetable-latest`, which the web app deploy picks up. [`scripts/publish`](scripts/publish/publish.mjs) uploads only new and changed files (by the sha256 in `checksums.json`), never removes a file before its new copy is up, and switches to a fresh release when most files changed, so a run stays well inside the hourly API budget.

### Using the data locally

With the [GitHub CLI](https://cli.github.com/) installed and logged in:

```sh
npm run gtfs:fetch    # downloads gtfs-latest into data/gtfs
npm run gtfs:verify   # re-runs the checks locally
```

Set `GTFS_TAG=gtfs-2026-10-02` (for example) to fetch a specific snapshot instead.

## Layout

```
.github/workflows/         CI, data refreshes, timetable build, Pages deploy, version tags
.claude/                   Claude Code hooks, skills (/task /spec /groom), reviewer agent
scripts/                   check.sh, bump.sh (version), gtfs/, layout/, publish/, showcase/, smoke/, speed/
packages/timetable-build/  GTFS -> compact timetable files
packages/routing/          RAPTOR engine and heatmap grid
packages/web/              web app
docs/                      specs/ (details of open tasks; later.md)
showcase/                  screenshots (screens/) and sharepics (sharepics/), made by scripts/showcase/build.mjs
```

How the work is planned and built (tasks, decisions, versions) is in [CLAUDE.md](CLAUDE.md), the open
tasks in [feature_list.json](feature_list.json), and what shipped in [CHANGELOG.md](CHANGELOG.md).

## Licence

Timetable data © VBB Verkehrsverbund Berlin-Brandenburg GmbH, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Footpaths and street names © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [ODbL](https://opendatacommons.org/licenses/odbl/); base map by [OpenFreeMap](https://openfreemap.org) from OpenStreetMap data.
