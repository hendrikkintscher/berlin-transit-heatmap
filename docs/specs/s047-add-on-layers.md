# S047: Add-on layers

Task S047 in `feature_list.json` (research). The first add-on would be the Cash Group ATMs (S048).

## Question

How can optional layers of places (ATMs first) be added to the map without slowing the first map
or taps?

## Prototype (2026-11-10, not merged)

- Data: one file per add-on and region, `data/<region>/<id>.json`, compact JSON
  (`{"v":1,"names":[…],"hours":[…],"p":[[lon,lat,name,hours],…]}`, 5 decimals).
- Code: its own chunk (`addons.ts`), imported only when the layer is on, after the first map, when
  the page is idle (`requestIdleCallback`, at most 2 s). It turns the file into GeoJSON and adds one
  MapLibre circle layer. For the timings, every point is drawn from the first view (minzoom 0).
- Points: synthetic, spread around the centre the way real ATMs are. The real data comes from
  S048. This container cannot reach OpenStreetMap (Overpass and Geofabrik reset the connection),
  but the OSM workflow (`osm-refresh.yml`) already downloads Geofabrik in GitHub Actions.

## Sizes

| what                         | 1,500 points    | 6,000 points   |
| ---------------------------- | --------------- | -------------- |
| data file, compact JSON (gz) | 35.8 KB (11 KB) | 143 KB (43 KB) |
| same as plain GeoJSON (gz)   | 212 KB (13 KB)  | 846 KB (52 KB) |
| add-on chunk (gz)            | 0.43 KB         | 0.43 KB        |
| main.js (gz)                 | +0.25 KB        | +0.25 KB       |

The budget's tolerance for main.js is 1 KB.

## Timings

`scripts/speed/browser.mjs` (copy with add-on and long-task timings), 360×740, fresh visits,
blank base map, 8 visits each, medians in ms. "Layer shown" is MapLibre's first idle after the
layer was added, counted from the first map. "Longest task" is the longest main-thread task after
the first map.

| run                      | CPU | first map | tap → trip    | footpath map | layer shown | longest task |
| ------------------------ | --- | --------- | ------------- | ------------ | ----------- | ------------ |
| main                     | 1×  | 853       | 185 (62–543)  | 1167         | –           | 266          |
| branch, off              | 1×  | 817       | 362 (211–428) | 1165         | –           | 322          |
| branch, on, 1,500 points | 1×  | 844       | 216 (49–543)  | 1349         | +1947       | 313          |
| branch, on, 6,000 points | 1×  | 860       | 251 (121–502) | 1152         | +1954       | 310          |
| main                     | 4×  | 1430      | 257 (107–758) | 1769         | –           | 234          |
| branch, off              | 4×  | 1394      | 295 (141–774) | 1840         | –           | 207          |
| branch, on, 1,500 points | 4×  | 1422      | 266 (144–367) | 1834         | +2850       | 239          |
| branch, on, 6,000 points | 4×  | 1020      | 234 (150–532) | 2064         | +3437       | 330          |

- First map: unchanged. Nothing of the add-on loads before it.
- Off: the code path ends at one check, so nothing loads. The off runs and main differ only within
  the setup's noise. A tap right after the first map lands while the stops and footpaths load, so
  tap → trip ranges from 50 to 750 ms in every run.
- On: the layer shows about 2 s after the first map (3–3.5 s at 4× CPU), after the footpaths and
  stops, as planned. With 6,000 points at 4× the longest main-thread task grows by about 100 ms (the
  GeoJSON is built on the page). With 1,500 points it does not grow.

## Design this suggests

- **One switch per add-on** in Ebenen (like Haltestellen-Wüsten), remembered like the other
  switches. Off: nothing loads.
- **Data built nightly in GitHub Actions** from the source S048 picks, published like the
  timetable files (release asset → deploy copies it into `data/<region>/` → the service worker
  caches it by version, `dataUrl`). The app makes no calls to outside services.
- **Loaded when the page is idle after the first map**, as one small chunk plus the file.
- **Shown from street zoom (about 12)**, so the city view stays clean, like the bus stops (decision 0009).
- **A tap on a pin is a normal tap**: the trip there. The card can add the place's name and opening
  hours (a build detail).
- Several add-ons share the same chunk and format: a new one is only a data file and a switch.

## Not measured

- Frame times while panning with the layer: this test browser draws too few frames with the real
  base map to measure them (decision 0009 had the same limit).
- Real ATM counts and coverage: that is S048.
