# @berlin-transit-heatmap/routing

Range-RAPTOR travel-time engine and heatmap grid. Pure TypeScript,
no DOM, zero runtime dependencies: it runs in a browser Web Worker and in Node.

```ts
import {
  loadTimetable,
  travelTimes,
  heatGrid,
  decodeStopList,
  decodeTimetable,
} from '@berlin-transit-heatmap/routing';

const get = async (name: string) => (await fetch(`./data/${name}`)).arrayBuffer();
const stops = decodeStopList(await get('stoplist.bin')); // once: stops and footpaths
const tt = loadTimetable(decodeTimetable(await get('timetable-weekday-10.bin'), stops)); // per hour
const result = travelTimes(tt, { lat: 52.5219, lon: 13.4132 }); // per tap
const grid = heatGrid(tt, result); // 250 m cells over Berlin: grid.seconds, row by row
```

The package exports TypeScript source (`exports` points at `src/index.ts`), so Vite and Vitest
consume it directly with no build step.

## Model

- **Range-RAPTOR.** Every distinct origin departure in `[windowStart, windowEnd]` that lines up
  with a trip leaving an access stop is scanned, latest first, keeping labels between scans. A
  stop's value is the minimum over departures of `arrival - departure`, i.e. the shortest trip
  that starts in the window without waiting at the origin.
- **Walking** follows the footpath network when one is passed (`walk` option, see below) at
  4 km/h unless the caller sets another speed (the app uses the walking speed setting, 5 km/h
  by default): from the origin to stops within `maxInitialWalkSeconds` (default 900), and from stops
  to cell centres within `maxFinalWalkSeconds` (default 900). The app walks up to 30 minutes at
  both ends (`FASTEST_WALK`). Without a network, or for points
  more than 300 m from it, walking is a straight line at 1.2 m/s. Transfers between vehicles use
  the timetable's footpaths (never two in a row), which timetable-build also measures on the
  network.
- **Rounds.** `maxRounds` (default 6) is the maximum number of vehicles used.
- **Overtaking trips.** Routes whose trips overtake each other are split into FIFO
  sub-routes at load time, so the earliest-catchable-trip search stays exact.

## Beyond travel times

- `TravelTimeResult.origin` (used by `heatGrid` for direct walking) and
  `TravelTimeResult.departures` (number of departures scanned).
- `heatGrid` option `bbox` (default `DEFAULT_BBOX`, Berlin with a small margin). The returned
  bbox is snapped outwards to whole cells; row 0 is the northernmost row.
- `travelTimes` option `trackLegs` fills `TravelTimeResult.legs`: the last leg of each stop's
  fastest journey (a ridden route stretch, a footpath, or the walk from the origin). Following
  legs back gives a journey tree; a parent is always strictly faster than its child.
  Leaving at one moment (`leaveAt`), `legs.rounds` also keeps every RAPTOR round's legs, and
  `journeyTo` follows those, so a trip shows only the rides it actually took (a stop's own
  fastest leg can come from a later round than the arrival a vehicle was boarded with).
- `heatGrid` option `trackStops` fills `HeatGrid.stop`: the stop each cell's time comes from.
- `routeUsage(tt, result, grid, { minShare })` uses both to weight every stop-to-stop hop by the
  number of grid cells whose fastest journey rides it. The web app draws these as the "Lines"
  overlay. Costs about 50 ms extra per origin in Node.
- `goalWindow`, `goalCells`, `goalShares`: the map to a destination (Ziel) at a time;
  `tripBetween` and `walksToStops`: the trip on tap.

## Walking network

`walk.bin` is built by timetable-build from OpenStreetMap (`--osm`) and published next to the
timetables. `loadWalkNetworkInSteps(buffer)` decodes it in pieces, so a worker can answer in
between, and `chainWalkNetworkInSteps` then folds the points along a street into chains between
junctions (S044); pass the result as `walk` to `travelTimes` and `heatGrid`.

- Format (`src/walkbin.ts`): u32 magic `BTHW`, u8 version 2, then LEB128 varints in columns:
  node and edge counts, the longitude scale, all lon deltas, all lat deltas (1e-5 degrees),
  per node its edge count to higher nodes, the index deltas, and each edge's whole metres
  minus the straight line between its ends (computed exactly from the stored integers, so
  usually 0 or 1). About 430k nodes, 1.9 MB gzipped.
- Points (origin, stops, grid cells) snap to the nearest edge within 300 m and enter the network
  at both of its ends. Cells on the same edge as a source walk straight along it.
- The final walk is one multi-source Dijkstra (a bucket queue by whole seconds) from all reached
  stops and the origin, so a grid costs about the same as the straight-line scatter (about
  100 ms at 50 m in Node). Snapping a grid layout to the network takes about 0.25 s once and is
  cached.

## Tests and benches

```sh
pnpm --filter @berlin-transit-heatmap/routing test       # fast: fixture network + brute-force cross-check
pnpm --filter @berlin-transit-heatmap/routing test:slow  # also the real VBB timetable
pnpm --filter @berlin-transit-heatmap/routing fetch-data # the real files for test:slow and the benches
```

The slow tests and the benches use `timetable-weekday-10.bin` (day), `timetable-weekday-02.bin`
(night), `stoplist.bin` and `walk.bin` from release `timetable-latest`, cached in `.data/`
(`ROUTING_DATA_DIR` overrides the folder). If a newer stop list no longer fits a cached
timetable ("different builds"), delete `.data/` and fetch again.

The benches in `bench/` (which ones, and what for: the repository's CLAUDE.md) run with
`pnpm --dir packages/routing exec tsx bench/<name>.ts`. `bench/speed.ts` is the CI speed probe
(see `scripts/speed/check.mjs`): the worker's map computation per start, colours and outlines
(from the web app's source), loading and snapping the cells to the footpaths.

The correctness test compares range-RAPTOR with an independent brute-force Connection Scan over
every candidate departure on random networks with overtaking trips.
