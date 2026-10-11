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

**Done** (PR #17): after setting a start, tap another place and choose "2. Start". The map then shades each spot by the slower of the two trips, a banner explains it and removes the second point, and tapping shows both times. The second point is kept in the URL (`with=lat,lon`) and can be dragged.

Pick two start points and show where both people can get to within the same time, as in Mapnificent and the ÖPNV-Isochronenkarte Deutschland. Shade each cell by the slower of the two trips (max of both travel times), so the map answers "where can we both be in N minutes?". Same Day/Night windows as the single-point map.

Notes: run the router twice in the worker and combine the two grids; needs a second-marker UI and a URL parameter for the second point.

### Favourite places and a location score

**Done** (PR #17): the menu holds a list of favourite places, added by address search, by "★ Merken" on any tapped spot, or imported from Google Takeout (Saved Places .json, saved-list .csv; places without a position are looked up by name) or from the app's own export. Each has a weight (Wichtig 3, Normal 2, Ab und zu 1). With a start point, stars on the map and the list show the trip time to each place, and a chip shows the score Hendrik chose: the weighted average in minutes, unreachable places counting as 120. The list stays in the browser. LLM suggestions for hotel stays are not built.

Keep a list of the places you go to often (workplace, friends, favourite bars) and see at once how well a chosen location reaches them. This helps when checking out places to move to, or when picking a hotel. For a hotel, the list could also come from an LLM that suggests interesting places based on your interests.

- Enter places by address search, or import a list (for example a Google Maps saved list, via its Takeout export).
- When you tap a location, show the travel time from it to each favourite place, using the same Day/Night windows.
- Combine those times into one score for the location. Ranking or weighting the places (the workplace counts more than an occasional bar) makes the score more accurate.

Notes: the routing already gives times to every point, so per-place times are lookups in the existing grid. The list lives in the browser (local storage, or a shareable URL or file), so no server is needed. The score formula (e.g. a weighted average of times, or the share of places within N minutes) is still to be chosen.

## 4. Time of day and weekends

### Hour-of-day selector and weekend switch

**Done** (PR #18): the clock button in the top bar opens a picker with Werktag/Wochenende and the 24 hours; the map shows the fastest trips departing within that hour. Weekday is a Tuesday to Thursday, weekend a Saturday, and 0–4 Uhr at the weekend is the night from Friday to Saturday (U-Bahn running all night). The build makes 48 hourly files (0.55–0.71 MB gzipped each); the stop-frequency and desert layers follow the chosen hour, with the night desert thresholds (20/30 min) from 0 to 5 Uhr. Links keep the choice (`t=weekend-02`); old `w=night` links open weekday 2 Uhr.

Night service in Berlin is very different in the early hours of Saturday and Sunday (U-Bahn runs all night) compared to weekday nights. Instead of the two fixed windows (Day 10–12, Night 2–4 on a weekday), pick any hour of the day plus a Weekday/Weekend switch; choosing 10:00 shows the fastest trips starting between 10:00 and 11:00. A smaller first step would be a weekend variant of the Night window only.

Notes on cost: today each window is one timetable file (day about 0.9 MB gzipped, night less), downloaded only when used. Hourly files would be smaller each (a 1-hour window plus the trips needed to finish journeys), so what a phone downloads per choice stays about the same or drops; switching hours means a new download (cached afterwards). The build would produce 24 x 2 files (Saturday and Sunday nights may need their own days), roughly 15–25 MB gzipped in the release, which GitHub Pages handles. Routing per tap stays about as fast, since a shorter window has fewer departures to scan. The stop-frequency and desert layers would follow the chosen hour automatically.
