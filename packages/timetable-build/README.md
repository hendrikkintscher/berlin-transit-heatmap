# @bth/timetable-build

Turns the VBB GTFS feed into the small timetable files the browser router loads (Contract 1 in the alpha plan; types in [`src/types.ts`](src/types.ts)).

```sh
pnpm build-timetable --gtfs data/GTFS.zip --out work/out
# options: --feed-version <string>  --date YYYY-MM-DD (override the reference day)
#          --osm work/walkways.opl.gz (walking network from release osm-latest)
```

`--gtfs` takes the zip or an extracted folder. The run takes about 10 seconds on the full VBB feed and prints stats.

## Outputs

| File                                                   | Contents                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timetable-weekday-HH.bin`, `timetable-weekend-HH.bin` | `Timetable` (binary, Contract 4) for one departure hour HH (00–23) on the weekday or weekend reference day; hours 00–04 are the night after the previous day (24:00–29:00 service time). |
| `timetable-YYYYMMDD-HH.bin`                            | the same for each real date of the coming week (`--days`)                                                                                                                                |
| `timetable-day.bin`, `timetable-night.bin`             | only with `--no-hourly`: 10:00–12:00 on the reference day and 02:00–04:00 the following night (tests, quick local runs)                                                                  |
| `stops.json`                                           | `{ version, serviceDate, feedVersion, stops }`, same `stops` as above                                                                                                                    |
| `build-info.json`                                      | stats, file sizes (raw and gzipped), and the GTFS manifest in CI                                                                                                                         |
| `walk.bin`                                             | with `--osm`: the walking network (Contract 3, see the routing README)                                                                                                                   |

## How the files are built

- **Reference day:** the first Tuesday–Thursday at least 3 days after the feed start that is not a Berlin public holiday (computed, including Easter-based dates).
- **Weekend reference day:** the first Saturday after the weekday reference day where neither that Saturday nor the Sunday after is a public holiday. `weekend-00` to `weekend-04` are the night from Friday to Saturday.
- **Services:** `calendar.txt` plus `calendar_dates.txt`. Trips of the previous and next service day are included when their shifted times fall in the window, so the night window also contains trips the feed lists as 02:xx on the next day.
- **Area:** stops inside the region's `stopBbox` (`packages/routing/src/regions.ts`); trips keep only their stops inside. Stops where the vehicle neither picks up nor drops off are skipped.
- **Time filter:** a trip is kept if it departs any kept stop within `[windowStart, windowEnd + 2h]`.
- **Routes:** identical trips are removed; trips are grouped by GTFS route and identical stop sequence, then split so no trip overtakes another (RAPTOR needs this). Trips are sorted by first departure.
- **Missing times** are interpolated; times are made non-decreasing along a trip.
- **Transfers** (the same in every window, both directions always present): every pair of stops within 400 m, `network distance / 4 km/h + 60 s` with `--osm` (pairs whose walk is over 800 m, e.g. across a river, get none), else `distance / 1.2 m/s + 60 s`; platforms of the same station at most 120 s, both edges of one island platform 60 s. `transfers.txt` overrides the walking estimate: type 2 rows with `min_transfer_time` and timed transfers (type 1, 0 s), without trip restrictions; rows tied to routes count only where no general row exists, with the longest of them.

## Notes for consumers

- `stops` is identical in every window file (and `stops.json`), so a stop index means the same stop in every hour.
- Parent stations are included as entries so that `parent` can point at them. They have no routes and no transfers; routing can treat them as ordinary stops.
- Coordinates are rounded to 5 decimals (about 1 m).

## Walking network

`--osm` reads the walkable OpenStreetMap ways that the "Refresh OSM footpaths" workflow publishes as `walkways.opl.gz` on release `osm-latest` (Geofabrik Berlin + Brandenburg, cut to the app's area). [`src/walk.ts`](src/walk.ts) keeps streets, paths, steps and platforms (no motorways, private ways, driveways or parking aisles), cuts them into edges at junctions and at least every 100 m, drops dead ends under 30 m, and keeps the largest connected piece. Reading takes about 15 s and 1 GB of memory.
