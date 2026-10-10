# @bth/timetable-build

Turns the VBB GTFS feed into the small timetable files the browser router loads (Contract 1 in the alpha plan; types in [`src/types.ts`](src/types.ts)).

```sh
pnpm build-timetable --gtfs data/GTFS.zip --out work/out
# options: --feed-version <string>  --date YYYY-MM-DD (override the reference day)
```

`--gtfs` takes the zip or an extracted folder. The run takes about 10 seconds on the full VBB feed and prints stats.

## Outputs

| File                   | Contents                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `timetable-day.json`   | `Timetable` for 10:00–12:00 on the reference day                      |
| `timetable-night.json` | `Timetable` for 02:00–04:00 the following night (93600–100800 s)      |
| `stops.json`           | `{ version, serviceDate, feedVersion, stops }`, same `stops` as above |
| `build-info.json`      | stats, file sizes (raw and gzipped), and the GTFS manifest in CI      |

## How the files are built

- **Reference day:** the first Tuesday–Thursday at least 3 days after the feed start that is not a Berlin public holiday (computed, including Easter-based dates).
- **Services:** `calendar.txt` plus `calendar_dates.txt`. Trips of the previous and next service day are included when their shifted times fall in the window, so the night window also contains trips the feed lists as 02:xx on the next day.
- **Area:** stops inside lon 13.05–13.80, lat 52.33–52.70; trips keep only their stops inside. Stops where the vehicle neither picks up nor drops off are skipped.
- **Time filter:** a trip is kept if it departs any kept stop within `[windowStart, windowEnd + 2h]`.
- **Routes:** identical trips are removed; trips are grouped by GTFS route and identical stop sequence, then split so no trip overtakes another (RAPTOR needs this). Trips are sorted by first departure.
- **Missing times** are interpolated; times are made non-decreasing along a trip.
- **Transfers** (shared by both windows, both directions always present): every pair of stops within 400 m, `distance / 1.2 m/s + 60 s`; platforms of the same station at most 120 s; `transfers.txt` rows of type 2 with `min_transfer_time` and no route/trip restriction override the walking estimate.

## Notes for consumers

- `stops` is identical in both window files (and `stops.json`), so a stop index means the same stop in day and night.
- Parent stations are included as entries so that `parent` can point at them. They have no routes and no transfers; routing can treat them as ordinary stops.
- Coordinates are rounded to 5 decimals (about 1 m).
