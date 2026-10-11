# Roadmap

Ideas queued after the alpha (live at https://hendrikkintscher.github.io/berlin-transit-heatmap/). Items marked **Done** are live. The groups run from small interface fixes to bigger features. Within a group, items that others depend on come first.

## 1. Interface and usability

Small changes to the app shell. They make room for everything below, so they come first.

### Burger menu

**Done** (PR #15): the menu button sits next to search and opens a panel with the Lines switch, the language switch and the About text. Day/Night stays in the top bar.

A menu button that opens a panel for secondary controls, so the map stays uncluttered on a phone. It holds the language switch and the map-feature toggles (Day/Night, Lines and later the layers from group 2), plus the About text.

Notes: the top bar today holds the search, Day/Night and Lines; on narrow screens the Day/Night hours are already hidden (PR #10). Search and the most-used toggle stay in the bar; the rest move into the menu.

### German by default, English switch

**Done** (PR #15): the app opens in German; the menu switches to English. The choice is remembered, and `?lang=en` in a link opens it in English.

The app speaks German by default, with a switch to English in the burger menu.

Notes: the interface is in English today (`<html lang="en">`). All UI text moves into one small string table per language. The choice is remembered in the browser and can be set by a URL parameter (e.g. `lang=en`); the address search already asks Photon for German results.

### Address search limited to the covered area

**Done** (PR #15): suggestions are limited to the heatmap's area (Berlin plus a narrow edge, the same rectangle the map is computed for), both in the Photon query and again on the device.

Only suggest addresses and places inside the area the map covers. If that's hard, limit them to Berlin addresses and places instead.

Notes: the search (packages/web/src/search.ts) already sends Photon a rectangular bbox around Berlin. A rectangle still includes parts of Brandenburg, so the plan is to also drop results that fall outside the heatmap's covered area (or outside the Berlin state boundary) on the client, before showing them.

## 2. New map layers

Extra layers you turn on and off in the burger menu.

### Stop-frequency layer

**Done** (PR #16): a menu switch draws a dot per station, coloured and sized by departures per hour (all platforms, lines and directions), for the Day or Night window. Tapping a dot shows the name, departures per hour and lines. Computed in the browser from the timetable already loaded, so the build pipeline is unchanged.

A layer showing how often each stop is served, e.g. departures per hour in the Day and Night windows, drawn as sized or coloured stop markers.

Notes: can be precomputed in timetable-build from stop_times per window and shipped as a small extra file.

### Transit-desert layer

**Done** (PR #16): a menu switch shades places by access time, the walk to a stop plus the average wait there (half the gap between departures), counted per platform. Light shading over 10 min by day (20 at night), dark over 15 (30 at night) or with no stop within a 15-minute walk. Tapping shows the access time.

A layer highlighting places that public transport serves poorly, e.g. areas far from any stop or only near stops with low frequency.

Notes: builds on the stop-frequency data (walking distance to the nearest stop weighted by its frequency); the exact definition and thresholds are still to be chosen.

## 3. Comparing places

Features that answer "how good is this location for me (or us)?".

### Meeting point: intersect two start points

Pick two start points and show where both people can get to within the same time, as in Mapnificent and the ÖPNV-Isochronenkarte Deutschland. Shade each cell by the slower of the two trips (max of both travel times), so the map answers "where can we both be in N minutes?". Same Day/Night windows as the single-point map.

Notes: run the router twice in the worker and combine the two grids; needs a second-marker UI and a URL parameter for the second point.

### Favourite places and a location score

Keep a list of the places you go to often (workplace, friends, favourite bars) and see at once how well a chosen location reaches them. This helps when checking out places to move to, or when picking a hotel. For a hotel, the list could also come from an LLM that suggests interesting places based on your interests.

- Enter places by address search, or import a list (for example a Google Maps saved list, via its Takeout export).
- When you tap a location, show the travel time from it to each favourite place, using the same Day/Night windows.
- Combine those times into one score for the location. Ranking or weighting the places (the workplace counts more than an occasional bar) makes the score more accurate.

Notes: the routing already gives times to every point, so per-place times are lookups in the existing grid. The list lives in the browser (local storage, or a shareable URL or file), so no server is needed. The score formula (e.g. a weighted average of times, or the share of places within N minutes) is still to be chosen.
