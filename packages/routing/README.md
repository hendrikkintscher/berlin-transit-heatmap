# @berlin-transit-heatmap/routing

Range-RAPTOR travel-time engine and heatmap grid (Contract 2 of the alpha plan). Pure TypeScript,
no DOM, zero runtime dependencies: it runs in a browser Web Worker and in Node.

```ts
import {
  loadTimetable,
  travelTimes,
  heatGrid,
  gridToGeoJSON,
} from '@berlin-transit-heatmap/routing';

const tt = loadTimetable(await (await fetch('./data/timetable-day.json')).json()); // once per file
const result = travelTimes(tt, { lat: 52.5219, lon: 13.4132 }); // per tap
const grid = heatGrid(tt, result); // 250 m cells over Berlin
const geojson = gridToGeoJSON(grid); // one square per reachable cell, properties { band, seconds }
```

The package exports TypeScript source (`exports` points at `src/index.ts`), so Vite and Vitest
consume it directly with no build step.

## Model

- **Range-RAPTOR.** Every distinct origin departure in `[windowStart, windowEnd]` that lines up
  with a trip leaving an access stop is scanned, latest first, keeping labels between scans. A
  stop's value is the minimum over departures of `arrival - departure`, i.e. the shortest trip
  that starts in the window without waiting at the origin.
- **Walking** is straight-line distance at 1.2 m/s: from the origin to stops within
  `maxInitialWalkSeconds` (default 900), along the timetable's footpaths after leaving a vehicle
  (never two footpaths in a row), and from stops to cell centres within `maxFinalWalkSeconds`
  (default 900). Cells near the origin also get the direct walk.
- **Rounds.** `maxRounds` (default 6) is the maximum number of vehicles used.
- **Overtaking trips.** Contract 1 routes whose trips overtake each other are split into FIFO
  sub-routes at load time, so the earliest-catchable-trip search stays exact.

## Additions to Contract 2

All additive; nothing in the contract changed.

- `TravelTimeResult.origin` (used by `heatGrid` for direct walking) and
  `TravelTimeResult.departures` (number of departures scanned).
- `heatGrid` option `bbox` (default `DEFAULT_BBOX`, Berlin with a small margin). The returned
  bbox is snapped outwards to whole cells; row 0 is the northernmost row.
- `gridValueAt(grid, lat, lon)` for the tap readout, `distanceM`, `WALK_SPEED_MPS`, and the
  Contract 1 `Timetable` types.
- GeoJSON types are declared locally and are structurally compatible with `@types/geojson`.
- `travelTimes` option `trackLegs` fills `TravelTimeResult.legs`: the last leg of each stop's
  fastest journey (a ridden route stretch, a footpath, or the walk from the origin). Following
  legs back gives a journey tree; a parent is always strictly faster than its child.
- `heatGrid` option `trackStops` fills `HeatGrid.stop`: the stop each cell's time comes from.
- `routeUsage(tt, result, grid, { minShare })` uses both to weight every stop-to-stop hop by the
  number of grid cells whose fastest journey rides it. The web app draws these as the "Lines"
  overlay. Costs about 50 ms extra per origin in Node.

## Tests and benchmark

```sh
pnpm --filter @berlin-transit-heatmap/routing test       # fast: fixture network + brute-force cross-check
pnpm --filter @berlin-transit-heatmap/routing test:slow  # also the real VBB timetable
pnpm --filter @berlin-transit-heatmap/routing bench day  # or: bench night [maxRounds]
```

The slow tests and the benchmark download `timetable-day.json` and `timetable-night.json` from
release `timetable-latest` into `.data/` (set `GITHUB_TOKEN` while the repository is private, or
drop the files there yourself; `ROUTING_DATA_DIR` overrides the folder).

The correctness test compares range-RAPTOR with an independent brute-force Connection Scan over
every candidate departure on random networks with overtaking trips.

### Benchmark (Node 22, cloud container, feed of 2026-10-08)

| window | stops  | routes | trips  | worst origin (RAPTOR + grid + GeoJSON)    |
| ------ | ------ | ------ | ------ | ----------------------------------------- |
| day    | 10,514 | 1,247  | 12,527 | 136 ms (Alexanderplatz, 1,625 departures) |
| night  | 10,514 | 1,501  | 4,658  | 98 ms (Alexanderplatz, 461 departures)    |

That is well under the 1 s Node target (about 3 s on a phone), so the default of 6 rounds stays.
Sanity checks by day: Alexanderplatz to Zoologischer Garten 13.4 min, Hauptbahnhof to BER
21.5 min (FEX).
