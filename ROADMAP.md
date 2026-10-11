# Roadmap

Ideas queued after the alpha (live at https://hendrikkintscher.github.io/berlin-transit-heatmap/). Items marked **Done** are live. Groups 1–4 are done apart from two items added to group 3 (suggested meeting points, search result choices); groups 5–10 come from reviews of the live app (group 7 from Hendrik's review of group 6), group 11 is the Android app and group 12 temporary changes; they run from quick wins to bigger features. Within a group, items that others depend on come first.

**Ground rule: snappiness is the app's USP.** A tap must keep answering at once, on a phone too. No feature may slow down taps, panning or the first map; anything heavy is precomputed in the build, loaded in the background, or optional.

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

### Suggested meeting points

With two start points, suggest a few good places to meet (about three) and mark them on the map. Tapping one shows the connections for both people: each person's trip, drawn and listed in the trip card.

Notes: candidates are the cells with the smallest slower-of-both time, with the sum of both times as a tie-breaker so neither person carries the whole trip. Pick the best, leave out everything within about 1.5 km of it, and repeat, so the suggestions are spread out. Prefer spots at a station or a named place and label them with the station or Ortsteil name. Trip on tap already draws and lists both trips when a second start is set, so tapping a suggestion reuses it. Small to medium effort; added from Hendrik's request on 2026-10-11 and built right after group 8.

### Search result: new start, destination or second start

Once a start is set, picking a search result asks what the place is for, with three buttons: **Neuer Start** (replaces the start, as today), **Ziel** (keeps the map and shows the trip there, as a tap on the place would), or **2. Start** (adds it as the second start for the meeting point). Without a start, a search result simply becomes the start, as now.

Notes: today a search result always replaces the start (pickPlace in main.ts). The three actions already exist for taps on the map (trip on tap, "2. Start" in the tap card), so this is mostly a small choice sheet after the search. Small effort; added from Hendrik's request on 2026-10-11, built together with the suggested meeting points.

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

## 5. Everyday use on the phone

Small additions that make the map quicker to use day to day. All are small (an afternoon each), so they come before the bigger accuracy work. Order: what people use most first.

### "Mein Standort" button

**Done** (PR #21): a locate button in the top bar sets the start at the phone's position; outside the map it says so.

A locate button next to search that sets the start point at the phone's position. If the position is outside the covered area, the app says so instead of moving the start.

Notes: MapLibre's GeolocateControl or a small custom button; asks for location permission only when tapped.

### Share button

**Done** (PR #21): the first button in the menu shares the current link through the phone's share sheet, or copies it.

A button that shares the current view (start, second start, departure time, layers) through the phone's share sheet, with a copy-link fallback. Most useful with the meeting point: "here is where we can both get to".

Notes: the URL already holds all of this; `navigator.share` with a clipboard fallback.

### Heatmap transparency slider

**Done** (PR #21): a slider in the menu (15–95 %, remembered on the device).

A slider in the menu for the heatmap's opacity (fixed at 70 % today), so street names and landmarks show through when you need to find your way. A press-and-hold on the map to peek at the base map is an alternative.

### Isochrone outlines

**Done** (PR #21): a menu switch draws outlines at 15, 30 and 45 minutes (bolder for shorter times, labelled), traced from a smoothed grid; small walk bubbles are left out. Kept in the link (`layers=iso`).

Optional thin contour lines at 15, 30 and 45 minutes on top of the heatmap, so "what's within half an hour" reads at a glance and stays readable when the heatmap is faint.

Notes: traced from the existing grid in the worker (marching squares) and drawn as a line layer; a menu switch.

### Data freshness note

**Done** (PR #21): the menu names the timetable day and says that engineering works and disruptions are not included; the About text explains the reference days.

A short line under the legend or in the About text: "Fahrplan vom 1. Oktober, Baustellen nicht berücksichtigt". Sets expectations about planned closures, which are common on S-Bahn and U-Bahn lines.

Notes: mostly wording; the build info already has the reference days. The build could also confirm the reference days are not holidays (it already skips them).

### Install hint and first-run help

**Done** (PR #21): after the first map, a hint explains tapping and dragging; on a later visit, Android shows an install button (also in the menu) and iPhones a short how-to. Each hint shows once.

A one-time hint to add the app to the home screen (Android and iOS), and a first-run hint for the two gestures: tap to set the start, tap again for minutes.

### Small polish

**Done** (PR #21): the status line fades after 5 seconds, wide screens show the app title, and a dashed frame marks the computed area.

- Fade the status line out a few seconds after a start point is set, so it doesn't sit under the tap card near the legend.
- A left-aligned app title ("Berlin in Minuten") in the top bar, so screenshots explain themselves.
- A faint outline of the computed area, showing where the heatmap ends.

### Thin 5-minute outlines

**Done** (PR #23): the outlines switch now draws a thin line every 5 minutes up to an hour, with 15, 30 and 45 bolder and labelled.

Hendrik's follow-up to the outlines: thin lines every 5 minutes, with the 15, 30 and 45-minute lines staying bolder and labelled, so the map reads like a contour map.

Notes: the worker already traces outlines per level (contours.ts), so this adds levels 5, 10, 20, 25 and so on up to 60 with a thin, lighter line. Possibly only from zoom 11, so the city view doesn't get crowded; the outline payload grows a few times but stays small.

### Blending the heatmap with the streets

**Done** (PR #23): the colours now sit under the basemap's roads, so streets show as white lines on top (faint in the city view, full strength from street level). Default opacity rose from 70 to 80 %; the slider stays.

A way of drawing the heatmap so both the colours and the streets and labels read well, instead of trading one for the other with the opacity slider.

Notes: options to try and compare on the phone: draw the heatmap under the basemap's roads and labels (inserting the layer below the road layers, so streets sit on top of the colour); a "multiply"-style look by lightening the basemap and raising the heatmap's contrast; or a muted basemap style. MapLibre has no layer blend modes, so layer order and the basemap's own colours are the main levers. Pick one default and keep the opacity slider.

## 6. Trips you can trust

Features that explain and sharpen the travel times. Each is a day or two of work and reuses the router as it is; together they turn the heatmap from a colour picture into something you act on.

### Show the trip on tap

**Done** (PR #24): tapping a place lists the connection under the minutes (changes, walking minutes, each line with its first and last stop) and draws it on the map, rides in line colours and walks dotted. Follow-up (PR #25): the route is compact (line badges, then changes, walking and the stops where you get on, change and get off) with a link that opens it in Google Maps; tapping a start point lets you remove it. BVG has no documented link format for a trip between two coordinates, so only Google is linked.

Tapping a place shows how you get there, not just the minutes: "8 Min. Fußweg · U8 bis Hermannplatz · M41 · 4 Min. Fußweg, 1 Umstieg", with the route drawn on the map. Optionally a link to open the trip in the BVG or Google app.

Notes: the router already tracks legs for the Lines layer (trackLegs/trackStops), so this is reconstructing one journey for the tapped cell.

### Typical time instead of best case

**Done** (PR #24): the map now shows the typical time by default (averaged over leaving at any minute in the hour, waiting included); "Bestfall" is a choice in the time sheet and kept in the link (`m=best`).

Today each place shows the shortest trip starting anywhere in the hour, which assumes you leave at exactly the right minute. A "typical" time, the average over leaving at a random minute with waiting included, is closer to real door-to-door time, especially at night and in the outskirts. "Typisch" would become the default, with "Bestfall" as an option, and the About text says which is shown.

Notes: range RAPTOR already scans every departure in the hour, so the average comes from the same pass. The score for favourites and the meeting point would follow the chosen measure.

### "Ankommen bis": travel times to a place

**Done** (PR #24): the time sheet has "Losfahren" and "Ankommen"; arriving colours how long it takes from everywhere to the start point, arriving within the chosen hour (`dir=arr`). Works for typical and best case and with the meeting point.

Reverse the direction: how long from everywhere to a chosen place (work, a venue), arriving within the chosen hour. Useful for flat hunting, where the question is the commute to the office.

Notes: a reverse RAPTOR pass over the same timetable; grid, colours and layers stay the same. A switch next to the departure time ("Abfahrt ab" / "Ankunft bis").

### Compare two times

**Done** (PR #24): "Vergleichen mit" in the time sheet picks a second day and hour; the map then shows minutes longer (red) or shorter (green) with its own legend, and a tap shows both times (`cmp=weekend-02`).

Colour each place by how much longer the trip takes at one time than another, for example weekday 10 Uhr against weekend 2 Uhr. Shows where the night or weekend network leaves gaps; pairs well with the transit-desert layer.

Notes: both grids already come from the same router; needs a second time choice in the picker and a diverging colour scale.

## 7. Reading the map

From Hendrik's review of group 6: the tapped route looks too much like the Lines layer, the colours still hide too much of the base map to tell which part of Berlin you are looking at, and at street level it should be easy to pick an exact street or address. These continue the blending work from group 5. Each is small to medium and helps every visit, so they come before the footpath work. Order: smallest and most visible first.

### Tell the route apart from the Lines layer

**Done** (PR #27): while a route is shown the Lines fade to 30 % without labels; the route has a dark outline, white stop dots with names where you get on, change and get off, and dark dotted walks.

While a route is shown, the Lines layer steps back (about 30 % opacity, thinner, no labels) and the route comes forward: thicker, with a dark outline instead of the white casing the Lines use, round stop dots where you get on, change and get off (with the stop names), and walking legs as a dark dotted line. Closing the card brings the Lines back. Small.

### Orientation: which part of Berlin am I looking at?

**Done** (PR #27): water (rivers, canals, lakes) is drawn over the colours in clear blue; parks and woods get a light green veil; the twelve Bezirke are named at city zoom and the basemap's Ortsteil names are bolder from zoom 11.5; the Ringbahn is a faint frame; seven landmarks are marked from zoom 10.5. District boundaries left out.

The features that tell people where they are, most useful first:

1. **Water**: the Spree, Havel, Landwehrkanal and the big lakes (Müggelsee, Wannsee, Tegeler See). The strongest shape cue in Berlin, and today it is hidden under the colours. Draw water on top of the heatmap in a clear blue-grey, with the river names.
2. **Large green spaces**: Tiergarten, Tempelhofer Feld, Grunewald, the Volksparks. Shown as a soft outline or a light veil over the colours, named at city zoom.
3. **District names**: the twelve Bezirke at city zoom, and well-known Ortsteile (Kreuzberg, Prenzlauer Berg, Neukölln, Charlottenburg) from about zoom 12, in a bolder label with a halo so they read on any colour.
4. **The Ringbahn** as a faint frame that stays visible even with Lines switched off: most Berliners place themselves "inside" or "outside the Ring".
5. **Motorways and main roads** (A100, the Bundesstraßen) already sit on top of the colours; keep them.
6. **A few landmarks** as small symbols at city zoom: Fernsehturm, Brandenburger Tor, Tempelhof, Olympiastadion, BER.

Faint district boundaries are optional; they tend to clutter the picture at phone size.

Notes: in the Positron basemap, water and parks are drawn below the roads, so the colours cover them. Fix this by drawing a copy of the water and park layers above the heatmap. The vector tiles (OpenMapTiles schema) already hold suburb and quarter places, POIs and house numbers that Positron doesn't style, so no new data is needed. The landmark list can be hand-picked. Medium effort.

### Street level: pick an exact street or address

**Done** (PR #27): the colours fade from zoom 13 to 45 % of the chosen opacity at zoom 16; house numbers from zoom 17 (max zoom now 18); a tap from zoom 15 names the nearest address (within 60 m) and "Hier starten" starts exactly there.

Zoomed in to streets, the map should work like a normal city map:

- From about zoom 14 the colours fade (to roughly 40 % at zoom 16), so street names read clearly. The opacity slider still sets the city-view strength.
- From zoom 17, show house numbers. The tiles have them; Positron doesn't draw them.
- Tapping at street level names the street and house number in the card, via Photon reverse geocoding (already used for favourites), so "Hier starten" picks an exact address.
- The start marker snaps to that address.

Small to medium.

### Shorter tap info

**Done** (with group 8): the info window shows just the minutes. The measure and time ("typisch, Werktag 10–11 Uhr") are already in the top bar, so Hendrik had them removed from the tap readout.

## 8. Realistic walking on real footpaths

Walking is measured today as a straight line at 1.2 m/s, to the first stop and from the last. Across the Spree, rail corridors, canals, cemeteries and the edges of Tempelhofer Feld the real walk is much longer, so the map is too green next to barriers. Hendrik chose the proper solution over a flat detour factor.

### Walking times on the OSM footpath network

**Done** (with group 8's PR): walks to the first stop, from the last stop and between stops follow real streets and paths from OpenStreetMap at 4 km/h (Hendrik's default; the menu's Gehtempo setting offers 3, 4, 5 or 6 km/h for walks to and from stops, while changes between stops stay at 4 km/h), so rivers, canals, rail lines and fenced areas now cost the detour to the next bridge or crossing. The build ships the network as `walk.bin` (2.1 MB gzipped, about 430k nodes), which the app loads in the background after the first map: the first map appears at once with straight lines and sharpens a moment later. Per tap the walking search costs about the same as the old straight-line spreading, so taps stay as fast as before. Instead of precomputed stop-to-cell tables, the browser runs one Dijkstra over the network per map, which was smaller to ship and exact. A monthly workflow refreshes the OSM data.

Precompute walking times on the OpenStreetMap footpath network in timetable-build: from each stop to the grid cells around it (up to the 15-minute walking limit), and between nearby stops for transfers. Ship them as a compact file next to the timetables; the router reads walking times from it instead of straight-line distance.

Why it comes after groups 5 to 7: it is the largest item so far (several days, a new data pipeline), while groups 5 to 7 are quick and help every visit. Its value is high, though, so it comes before the new modes in group 9, which build on it (bike times on real streets).

Notes:

- Data: a Berlin/Brandenburg OSM extract (Geofabrik), filtered to walkable ways, refreshed with the monthly GTFS job.
- Size: roughly 45k platforms times nearby cells; with quantised times and delta encoding this should stay a few MB gzipped, downloaded once and cached. To be measured in a prototype first.
- Until then, a detour factor of about 1.3 on straight-line distances would be a one-line stopgap if the green next to barriers bothers anyone.

## 9. More ways to travel

### Step-free mode

A switch that uses only stops and trips marked wheelchair-accessible in the VBB data, showing where travel with a pram, wheelchair or suitcase is much slower.

Notes: VBB GTFS has wheelchair_boarding for many stops and trips, but coverage may be patchy; check it before building. Medium effort.

### Bike + transit and bike only

A mode that cycles (about 15 km/h) to and from stations instead of walking, and a bike-only map for comparison. Taking the bike on the train and parking it can be a fixed time penalty.

Notes: the routing change is small; most effort is in the UI and defaults. Uses the street network from group 8 when available, a straight line with a detour factor otherwise. Large overall.

## 10. Performance

### Smaller, faster first load

First load is about 1.2 MB (JS about 300 KB gzipped plus one hourly timetable of 0.55–0.7 MB). If it becomes a problem: load the map style and timetable in parallel, move rarely used code (favourites import) into a lazy chunk, and store timetables in a binary format instead of JSON. Low priority now that the hourly files are smaller than the old Day file.

## 11. Android app

### Native Android app and how to ship it

An Android app from the Play Store (or a direct download) that opens straight into the map, works offline with the timetables already downloaded, and can later use phone features the web app can't, such as a home-screen widget for "Mein Standort".

The routing core is already its own package (packages/routing) for this reason. Options, from least to most work:

- **Trusted Web Activity (TWA):** wraps the existing PWA in a thin Android shell (Bubblewrap). Same code and updates as the website, small app, Play Store listing. Needs a Digital Asset Links file on the site, which GitHub Pages can serve. Small effort.
- **Capacitor:** the web app bundled inside a native shell, with plugins for location, sharing and widgets. Works offline from the first start because the code ships in the app; timetables still download. Medium effort; each update means a new app release.
- **Fully native (Kotlin):** best fit and feel, but the map, UI and routing would be rewritten or the routing run in an embedded JavaScript engine. Large effort; only worth it if the wrappers fall short.

Ways to ship it:

- **Google Play:** one-time developer fee (25 USD), identity check, a privacy policy page and a store listing; new personal accounts must run a closed test with testers for two weeks before public release. Updates go through review.
- **Direct APK** (from GitHub Releases): free and immediate, but users must allow installs from unknown sources and there are no automatic updates.
- **F-Droid:** free and open-source store; needs the app built from source with no proprietary dependencies, which suits this project.

Suggested path: start with a TWA, test it with a direct APK on Hendrik's phone, then publish to Google Play; move to Capacitor only when a native feature is needed. This can be done at any point, since it doesn't depend on groups 5 to 10.

## 12. Temporary changes

### Ersatzverkehr and other temporary changes

Find a good, low-effort way to show temporary changes such as Ersatzverkehr (rail replacement buses), closures and construction timetables, without slowing anything down.

Today the build picks one reference weekday and one Saturday from the monthly VBB feed, so whatever construction happens on those days is baked into the whole month, and changes on other days are missing. Options, from least to most work:

- **Pick a clean reference day:** compare several weekdays in the feed and choose one whose service matches the usual pattern, so a one-off closure does not colour the map for a month. Build-only, no app change.
- **A weekly refresh and a notice:** refresh the feed weekly, and list lines whose service this week differs a lot from the usual pattern ("U2: Ersatzverkehr Pankow–Alexanderplatz") in a small banner. Build-time diff, a few lines of UI.
- **"Diese Woche" as a second timetable:** offer the current week's actual service as an extra time option next to the typical one. Reuses the hourly files and the compare view; downloads only when chosen.

Notes: VBB's static GTFS already contains planned Ersatzverkehr as normal trips; there is no open real-time feed, so live disruptions are out of scope. All options keep the work in the build, in line with the ground rule above.
