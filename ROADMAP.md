# Roadmap

Ideas queued after the alpha (live at https://hendrikkintscher.github.io/berlin-transit-heatmap/). Items marked **Done** are live. Groups 1–10 are done apart from items added later in groups 3, 6, 7 and 10. Groups 5–10 come from reviews of the live app, group 11 is today's actual service, group 12 the UI overhaul, group 13 the wider area and other regions, and group 14 the Android app, postponed with no date (Hendrik, 2026-10-12). Items from the second suggestions list (plan/suggestions-2.md) keep their ids (B1, C1 …). Within a group, items that others depend on come first. The **Up next** list below is the build order; the builder takes the first open entry.

## Up next

State on 2026-10-12, live through PR #135. Build in this order, one step per PR:

1. **Next:** Time-line widths closer together (group 12)
2. Fix: street names in every search box, from a built-in street list (group 1)

Both from Hendrik on 2026-10-12, to be built now. After them, Hendrik picks the next step before anything starts.

**Held:** the region addresses (`/berlin/`, `/oldenburg/`) and the Oldenburg data (group 13), until the domain and the timetable feed account are settled.

**Blocked until Hendrik agrees:** Beta readiness (group 14). Not started until Hendrik has explicitly agreed to the full approach; suggestions are being drafted first. **Postponed:** Android app (group 14). Hendrik, 2026-10-12: not starting it yet or any time soon; it stays unstarted until he picks it up again.

Working rule (Hendrik, 2026-10-12): once the queued steps are done, he picks each next step himself; the editor confirms the pick to the builder. Important decisions on the way go to Hendrik as multiple choice.

**Not planned** (Hendrik, 2026-10-12): these were offered as next steps and set aside. They stay listed in plan/suggestions-2.md and are not built unless Hendrik brings them back.

- Fare zones: AB/C boundary on the map and a "C-Ticket nötig" note on the trip card (C5)
- Share a picture of the map instead of a link (C7)
- Who can I reach: "In 30 Min.: 41 % der Berliner, 210 km²" from the Zensus grid (C4)
- Dark map in dark mode and app shortcuts on the installed app (C9)

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

### Snappier address search

**Done** (PR #96): the first suggestion shows about 0.14 s after typing, instead of 1.9–2.7 s.

Hendrik, 2026-10-12: the address search should feel snappier. Today every keystroke waits for Photon (photon.komoot.io), a free public server, before anything shows. Ideas, measured against the snappiness rule:

- Show local matches at once from data the app already has, such as station names from the timetable, favourites and recent searches, and add Photon's addresses as they arrive.
- Keep the wait between keystrokes short, cancel requests that are out of date, and cache answers for the session.
- Measure the time from keystroke to first suggestion on a phone, before and after.

Small to medium effort. Added from Hendrik's request on 2026-10-12.

### Fix: street names in every search box

Hendrik, 2026-10-12: street names don't show up in the search suggestions. Suggestions, streets and the house-number/postcode step from PR #122 included, must work in every search box (main search, Startpunkt, meeting-point starts, favourites, comparison and any other).

Finding (builder, 2026-10-12): all search boxes do get street suggestions, but only from the online address search (Photon), 1–4 s after the stations, and Photon misses some streets entirely (for example "Karl-Marx-Straße" in Neukölln returns only Karl-Marx-Allee). Proposed fix: a local list of OSM street names (about 100 KB, loaded only when search opens) for instant street suggestions in every box. Hendrik picked "Built-in list" on 2026-10-12: build it, as its own step after the time-line widths.

Notes: station matches must stay instant; the first map must not get slower (the list loads only with search).

### Addresses in the search suggestions

**Done** (PR #122): street rows appear in the suggestions, one per postcode with the district; picking a street offers its house numbers in that postcode plus the whole street, and "Hauptstraße 10317" narrows to that postcode. Station matches still show instantly.

Hendrik, 2026-10-12: addresses should be part of the suggestions, not only stations, favourites and recent searches. A step-by-step way is fine: first the street name; once the street is chosen or typed, either the house number or the postcode.

- **Street first:** typing suggests matching street names (with the district, so "Hauptstraße" can be told apart) alongside the stations.
- **Then number or postcode:** once a street is picked, the field keeps the street and asks for the house number; a postcode narrows a street that exists in several places.
- **Speed:** local station matches still show at once (PR #96); street and address suggestions follow as they arrive, without slowing the first suggestion.

Small to medium effort; the builder picks the data source (Photon street/house results, or a street list built from OSM) by what keeps the search snappy.

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

**Done** (PR #35): with two starts, up to three stations (6+ departures an hour) with the smallest slower-of-both time, the sum as tie-breaker and at least 1.5 km apart, show as numbered pins (names from zoom 12.5); a tap shows both trips there.

With two start points, suggest a few good places to meet (about three) and mark them on the map. Tapping one shows the connections for both people: each person's trip, drawn and listed in the trip card.

Notes: candidates are the cells with the smallest slower-of-both time, with the sum of both times as a tie-breaker so neither person carries the whole trip. Pick the best, leave out everything within about 1.5 km of it, and repeat, so the suggestions are spread out. Prefer spots at a station or a named place and label them with the station or Ortsteil name. Trip on tap already draws and lists both trips when a second start is set, so tapping a suggestion reuses it. Small to medium effort; added from Hendrik's request on 2026-10-11, built together with the search result choice (Up next 1).

### Search result: new start, destination or second start

**Done** (PR #35): with a start set, a picked search result shows the trip there with "Neuer Start", "2. Start" and "★ Merken" instead of replacing the start.

Once a start is set, picking a search result asks what the place is for, with three buttons: **Neuer Start** (replaces the start, as today), **Ziel** (keeps the map and shows the trip there, as a tap on the place would), or **2. Start** (adds it as the second start for the meeting point). Without a start, a search result simply becomes the start, as now.

Notes: today a search result always replaces the start (pickPlace in main.ts). The three actions already exist for taps on the map (trip on tap, "2. Start" in the tap card), so this is mostly a small choice sheet after the search. Small effort; added from Hendrik's request on 2026-10-11, built together with the suggested meeting points.

### Meeting point scale in extra minutes

**Done** (PR #37): with two starts, the colours and outlines show extra minutes over the best slower-of-both time on the grid; the legend reads +0 … +60, +120, and a tap shows both times plus "+N Min. gegenüber dem besten Treffpunkt". The single-start map is unchanged.

With two starts, the colours show **extra minutes** instead of the slower trip's minutes: the best meeting places on the map are 0 and green, and every other place shows how many minutes more the slower of the two people needs than there. So the map answers "how much worse than the best spot is this?", and the best area is always green whether the two starts are close together or far apart. The legend reads "+0, +5, +10 … Min."; tapping a place still shows both people's actual times, plus the extra minutes.

Notes: extra = slower-of-both time minus the smallest slower-of-both time on the grid (the same value the suggested meeting points start from), so it is one subtraction per cell after the grid is combined, with no effect on speed. The suggested meeting points sit in the 0 band. Applies to the two-start view only; the single-start map keeps absolute minutes. Small effort; added from Hendrik's request on 2026-10-11, built right after the suggested meeting points.

### Favourite places and a location score

**Done** (PR #17): the menu holds a list of favourite places, added by address search, by "★ Merken" on any tapped spot, or imported from Google Takeout (Saved Places .json, saved-list .csv; places without a position are looked up by name) or from the app's own export. Each has a weight (Wichtig 3, Normal 2, Ab und zu 1). With a start point, stars on the map and the list show the trip time to each place, and a chip shows the score Hendrik chose: the weighted average in minutes, unreachable places counting as 120. The list stays in the browser. LLM suggestions for hotel stays are not built.

Keep a list of the places you go to often (workplace, friends, favourite bars) and see at once how well a chosen location reaches them. This helps when checking out places to move to, or when picking a hotel. For a hotel, the list could also come from an LLM that suggests interesting places based on your interests.

- Enter places by address search, or import a list (for example a Google Maps saved list, via its Takeout export).
- When you tap a location, show the travel time from it to each favourite place, using the same Day/Night windows.
- Combine those times into one score for the location. Ranking or weighting the places (the workplace counts more than an occasional bar) makes the score more accurate.

Notes: the routing already gives times to every point, so per-place times are lookups in the existing grid. The list lives in the browser (local storage, or a shareable URL or file), so no server is needed. The score formula (e.g. a weighted average of times, or the share of places within N minutes) is still to be chosen.

### Meeting point for three or more people (C1)

**Done** (PR #64): up to five starts, each with its own colour; the map shows extra minutes over the best slowest-of-all time, suggestions rank by the slowest and then the sum, and a tap lists everyone's minutes and trip. Links repeat `with=`; the banner's ✕ ends the meeting point.

Friends often meet in groups of three to five. Generalise the meeting point to up to five starts: the map shows extra minutes over the best slower-of-all time, the suggested meeting points work the same way, and a tap lists everyone's trip. Kept in the link with `with=` repeated.

Notes: one routing pass per start, so five starts take about 2.5 times the two-start time; start with three and measure against the snappiness rule. Medium effort; built in one step with C2. From suggestions-2, picked by Hendrik on 2026-10-12.

### "Lieblingsort" toggle instead of "Merken"

**Done** (PR #118): the trip card shows ☆/★ "Lieblingsort" ("Favourite place" in English); a tap adds or removes the place and the card stays open.

Hendrik, 2026-10-12: the "★ Merken" button on the trip card is renamed **"Lieblingsort"** (English: "Favourite place") and becomes a toggle: tapping it adds the place to the favourites, tapping it again removes it. It no longer closes the connection view. The button shows whether the place is already a favourite (filled vs. empty star).

Small effort.

### Fairer meeting point suggestions

**Done** (PR #93): suggestions rank by slowest trip + average trip; the map colours still show the slowest trip.

Hendrik, 2026-10-12 (option C from research/meeting-fairness/meeting-fairness.md): the suggested meeting points rank by **slowest trip + average trip**, counted equally, instead of slowest trip first with the total only breaking ties. One extra minute for the slowest person is then worth it when the group saves at least (people + 1) minutes. With 3+ people this stops picks like Hermannstr. 39/39/31 over Friedrichstr. 40/38/12, and with two people it mostly keeps today's fair picks.

- **Where:** `suggestMeetingPoints` in `packages/web/src/meet.ts`; the 1.5 km spacing and the top 3 stay.
- **Unchanged:** the map colours keep showing the slowest person's time.

Small effort, no speed cost.

### "Where can I live?" map from my favourites (C2)

**Done** (PR #64): the Wohnlage-Karte in the menu, under the favourites, combines one Typisch "arrive" pass per favourite into the weighted average per cell (unreachable counts as 120 min), with progress shown. It always uses Typisch and is not kept in links. A tap shows the average and the minutes to each place.

Today the favourites score is shown for the chosen start only. Flat hunters want the opposite: shade the whole map by the score, so the green areas are where all your important places are close. One "Ankommen" pass per favourite, combined with the weights into the weighted-average score per cell (unreachable counting as 120, as now).

Notes: with 5–8 favourites this takes several seconds on a phone, so it is computed on demand behind a button ("Wohnlage-Karte") with progress shown, and cached until the favourites or the time change. Medium effort; built in one step with C1. From suggestions-2, picked by Hendrik on 2026-10-12.

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

### Visual polish: round buttons, legend and info box at the bottom, clearer ✕

**Done** (PR #40): the top buttons are true circles; the legend sits just above the bottom safe area with the tap info box joined on top as one panel; every ✕ (tap card, meeting point, compare, hints) is a 36 px round button with a 46 px touch target, and the tap card gained one to deselect.

Small fixes from Hendrik's look at the phone layout:

- **Round buttons:** the locate, search and menu buttons at the top become true circles (today they are slightly oval), the same size and spacing.
- **Legend at the very bottom:** the minute and colour legend sits flush at the bottom edge (above the phone's home bar), with the status line and hints above it, so the map gets the most room and the legend is always in the same place.
- **Info box at the bottom too:** the tap info box (minutes, trip, buttons) sits at the bottom, directly above the legend, instead of floating over the map near the tap, so the legend and the info read as one bottom panel and the map above stays clear. Added from Hendrik's request on 2026-10-11.
- **A more obvious ✕ to deselect:** the ✕ that closes the tap card and removes a selection gets bigger, with a visible round background and a larger touch target (at least 44 px), so it is easy to find and hit.

Notes: CSS and layout only, no effect on speed. Check at 360×740 and on an iPhone-sized screen with the home bar (safe-area insets). Small effort; added from Hendrik's request on 2026-10-11.

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

### "Nächste": the next connection from now

**Done** (PR #32): "Nächste" is the third Reisezeit choice. For the current hour it leaves now and the time pill shows the minute ("Wochenende ab 20:28 Uhr"); for another hour it leaves on the hour; with "Ankommen" it is the last connection arriving on the hour. It is a single RAPTOR pass, the fastest of the three (about 20 ms routing per origin in Node), and it recomputes from the new "now" when you come back to the app. Kept in the link as `m=next`.

Add a third choice under Reisezeit next to Typisch and Bestfall: **Nächste** shows the next possible connection, so each place gets the time it takes if you leave right now, waiting for the next departure included. That suits a quick "how long from here, now?" look, while Typisch stays the planning default.

Notes: one RAPTOR pass from the current minute instead of the range over the hour, so it is as fast as Bestfall or faster. It uses the hour file the map already opens at (the map now opens at the current hour); each hourly file holds the trips running into the next hour, so later departures are covered. In the time sheet it makes most sense for the current hour; for another hour it would mean leaving at the start of that hour. Kept in the link (`m=next`); trip on tap shows the actual next departure. Small effort; added from Hendrik's request on 2026-10-11.

### Start on "Nächste", earliest arrival on tap, Typisch for meeting points

**Done** (PR #62): the app opens on "Nächste"; a link carrying `m=` keeps its setting (`m=typical` is now named in links). Under Typisch and Bestfall a tapped place also shows the next connection from now with its own minutes, and the drawn trip is that connection. Adding a second start switches to Typisch; removing it returns to the earlier choice unless another was picked meanwhile.

Three changes to the defaults:

- **The app opens on "Nächste"** instead of Typisch: the first map answers "how long from here, if I leave now?". Typisch and Bestfall stay as choices, and a link that carries `m=` keeps its setting.
- **A tapped place shows the connection that arrives earliest when you leave now**, waiting included. If a later departure gets there sooner than the very next one, the later one is shown. The minutes in the info box and the drawn trip are that same connection.
- **With two or more starts (meeting point), Reisezeit switches to Typisch**, since meeting plans are usually not for right now. You can still pick Nächste or Bestfall there; removing the second start returns to the previous choice.

Notes: Nächste is already the fastest of the three to compute (a single RAPTOR pass), so the new default helps the first map. Earliest arrival is what RAPTOR from the current minute gives; the change is making trip on tap use that pass instead of a fixed departure. Small effort; added from Hendrik's request on 2026-10-12.

### Tap card: leave in X min, arrival time, trip duration

Hendrik, 2026-10-12: the tap card no longer needs the line note "schnellster Weg zu X % der Karte". Instead it says when to go and when you arrive, for the next connection:

- **Which connection:** still the one that gets you there soonest from this moment, waiting included (as since PR #62), not the one with the least time on board.
- **What it shows:** the trip's own duration and the arrival time as the main line ("18 Min. · an 10:42"), and smaller beneath it when to leave: "los in 5 Min." (or "jetzt los" when it is due now). The route summary stays below.
- **Keeps up:** the "in X Min." counts down while the card is open, and moves on to the following connection once this one is missed.

The line note goes from the card; tapping a line on the Lines layer still shows its name. Small effort; the routing already finds this connection.

**Done** (PR #85): the card shows the trip's duration and arrival time, with "los in X Min." or "jetzt los" beneath, counting down live and moving to the following connection once this one is missed. The "schnellster Weg zu X % der Karte" note is gone.

### "Ankommen bis": travel times to a place

**Done** (PR #24): the time sheet has "Losfahren" and "Ankommen"; arriving colours how long it takes from everywhere to the start point, arriving within the chosen hour (`dir=arr`). Works for typical and best case and with the meeting point.

Reverse the direction: how long from everywhere to a chosen place (work, a venue), arriving within the chosen hour. Useful for flat hunting, where the question is the commute to the office.

Notes: a reverse RAPTOR pass over the same timetable; grid, colours and layers stay the same. A switch next to the departure time ("Abfahrt ab" / "Ankunft bis").

### Compare two times

**Done** (PR #24): "Vergleichen mit" in the time sheet picks a second day and hour; the map then shows minutes longer (red) or shorter (green) with its own legend, and a tap shows both times (`cmp=weekend-02`).

Colour each place by how much longer the trip takes at one time than another, for example weekday 10 Uhr against weekend 2 Uhr. Shows where the night or weekend network leaves gaps; pairs well with the transit-desert layer.

Notes: both grids already come from the same router; needs a second time choice in the picker and a diverging colour scale.

### The tapped place stays when settings change

**Done** (PR #55): the tapped place stays through a change of hour, measure, direction, travel mode, step-free, walking speed, language, layers or a moved start; a small dot marks it, its card dims while the new map computes and then shows the new minutes and trip. Only ✕ or a new tap removes it. Kept in the link as `to=lat,lon`.

Today a tapped place (the destination whose minutes and trip are shown in the info box) disappears as soon as a setting changes: another hour, Typisch/Bestfall/Nächste, Losfahren/Ankommen, Unterwegs, Stufenlos, Gehtempo, or a moved start. It should stay: the marker remains, and the minutes and the drawn trip recompute for the new setting, so you can compare settings for the same place without tapping it again. Only the ✕ or a new tap removes it. The second start (meeting point) already stays and is kept in the link; the tapped place could be kept in the link too (`to=lat,lon`).

Notes: every settings change calls hideReadout() in main.ts, which drops the tapped place; instead keep the point and re-run the trip request once the new grid is ready. One trip per change, so no cost to speed. Small effort; added from Hendrik's request on 2026-10-11.

### "Bis wann komme ich heim?": the last connection home (C3)

**Done** (PR #66): from the start card (🌙 Bis wann heim?) or a favourite's 🌙, the map colours every place by the latest departure that still gets you home fast, over the evening and night timetables (20–04 Uhr). A tap shows that last connection and whether the night network carries on later. Closing a special map (this one or the Wohnlage-Karte) now brings the start's map back.

At night the question is not how long, but how late you can still leave. With home (the start, or a favourite) as the target, colour each place by the latest departure that still gets you home, with a marker where the night network takes over. A tap shows that last connection.

Notes: uses the existing arrive-by pass over several hours of timetables (the hourly files for the evening and night), so it is heavier and runs on demand, not on every tap. Medium effort. From suggestions-2, picked by Hendrik on 2026-10-12.

## 7. Reading the map

From Hendrik's review of group 6: the tapped route looks too much like the Lines layer, the colours still hide too much of the base map to tell which part of Berlin you are looking at, and at street level it should be easy to pick an exact street or address. These continue the blending work from group 5. Each is small to medium and helps every visit, so they come before the footpath work. Order: smallest and most visible first.

### Tell the route apart from the Lines layer

**Done** (PR #27): while a route is shown the Lines fade to 30 % without labels; the route has a dark outline, white stop dots with names where you get on, change and get off, and dark dotted walks.

While a route is shown, the Lines layer steps back (about 30 % opacity, thinner, no labels) and the route comes forward: thicker, with a dark outline instead of the white casing the Lines use, round stop dots where you get on, change and get off (with the stop names), and walking legs as a dark dotted line. Closing the card brings the Lines back. Small.

### Smooth line overlays along the real tracks and roads

**Done** (PR #99, #102): U-Bahn, S-Bahn and tram lines and the drawn trips follow the real tracks from VBB's GTFS shapes (lines.bin, about 0.16 MB gzipped, loaded after the first map). The first map is unchanged at about 0.75 s.

Hendrik, 2026-10-12: the lines on the Lines layer (and the drawn route) have corners that are too sharp. U-Bahn, S-Bahn and tram lines should follow where they actually run. Bus lines may stay simpler, but should follow the road.

- **Find the real geometry:** check whether VBB's GTFS feed carries `shapes.txt` for these lines. If not, take the tracks from OpenStreetMap (the route relations for U-Bahn, S-Bahn and tram, or the rail and tram ways), which the build already reads for footpaths.
- **Buses:** snap the line to the streets between stops if that is cheap at build time. Otherwise smooth the stop-to-stop line so it at least has no sharp corners.
- **Speed:** the geometry is prepared in the build and simplified per zoom level, so the Lines layer loads no slower than now.

Medium effort; finding the data source comes first. Added from Hendrik's request on 2026-10-12.

### Shown connection without a black border

**Done** (PR #108): the ride legs keep their line colours and width, with no border.

Hendrik, 2026-10-12: the lines of the connection shown on the map should not have a black border. Draw the ride legs in their line colours without the dark outline from PR #27; keep them apart from the Lines layer by width and the faded Lines (30 %) instead. Walks and stop dots stay as they are. Small effort.

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

### Calmer street level: footpaths next to streets

**Done** (PR #73): the tiles carry no sidewalk tag, so footways and cycleways are drawn thin and faint; park paths, squares and steps stay a little more visible.

At the closest zoom levels the basemap also draws footpaths, many of them sidewalks mapped as separate lines right next to each street, so streets look doubled and the map gets busy. Find a calmer look: hide paths that run alongside a street (OSM sidewalks, `footway=sidewalk`) and keep paths that go where streets don't (through parks, across squares, between blocks), or draw all paths much fainter and thinner than streets. A walk shown for a tapped trip stays fully visible either way.

Notes: this is the basemap style (Positron vector tiles), not the walking data; check which path layers and attributes the tiles carry, and compare the options at zoom 16–18 on the phone. No cost to speed. Small effort; added from Hendrik's request on 2026-10-11.

### Heatmap colours off by default

**Done** (PR #71): the map opens with the outlines only, each in its legend colour on a white edge and every line labelled with its minutes. The "Farben (Heatmap)" switch in the layers brings the colours back, with the opacity slider under it. Links use `layers=heat` (and `layers=noiso` for no outlines). A comparison always shows its colours.

The map opens without the coloured travel-time fill: the plain base map with the start, and the 5-minute outlines on, each labelled with its minutes, so the travel times still read at a glance while streets and places stay fully visible. A new "Heatmap" switch in the layers (next to Lines, outlines, stop frequency and transit deserts) turns the colours on, with the opacity slider beneath it; the choice is kept in the link (`layers=heat`). Tapping a place still shows its minutes and trip, and the legend stays as the key for the outlines.

Notes: the routing is unchanged (outlines and taps need it), and drawing no colour raster is, if anything, faster on first load. Special maps (meeting point, Wohnlage-Karte, Bis wann heim?) follow the same switch. Small effort; added from Hendrik's request on 2026-10-12 ("turn heatmap off as a default"). Read as: colours off, outlines on, one tap to bring the colours back.

### Fainter default outlines: one colour, 10-minute steps

**Done** (PR #76): without the colour fill, outlines come every 10 minutes in a single hue, darkest near the start, thinner and partly transparent, each labelled; the legend shows the same steps. With the fill on nothing changes; the home map keeps its own colours.

Hendrik's feedback on PR #71 (2026-10-12): starting with only the outlines is right, but they should be calmer. In the outlines-only view:

- **Fainter:** thinner, partly transparent lines, so the base map stays in front.
- **One colour:** a gradient of a single hue instead of the legend's many colours, darkest near the start and lighter further out.
- **10-minute steps:** outlines at 10, 20, 30 … minutes instead of every 5, each still labelled with its minutes.

With "Farben (Heatmap)" on, the colours and their outlines stay as they are. The legend in the outlines-only view shows the same single-hue 10-minute steps. Small effort; no routing change.

### Outlines view: dashed lines, more labels, clearer gradient, no legend

**Done** (PR #81): with the colour fill off, the 10-minute outlines are dashed, their minutes repeat about twice as often, the single hue runs from near-black purple to pale lilac, and the colour legend is hidden. With the fill on, and on the home map, nothing changes.

Hendrik's second round of feedback on the outlines-only view (PR #76, 2026-10-12):

- **Dashed lines:** the 10-minute lines are drawn dashed instead of solid.
- **More labels:** the minute label repeats more often along each line, so every stretch of the map shows which line it is without panning.
- **Clearer gradient:** the single-hue steps differ more from each other (a wider range from dark near the start to light far out), so the time order reads at a glance.
- **No legend:** with the colour fill off, the colour legend is hidden, since the labels carry the minutes. It comes back with "Farben (Heatmap)" on.

Small effort; no routing change.

## 8. Realistic walking on real footpaths

Walking is measured today as a straight line at 1.2 m/s, to the first stop and from the last. Across the Spree, rail corridors, canals, cemeteries and the edges of Tempelhofer Feld the real walk is much longer, so the map is too green next to barriers. Hendrik chose the proper solution over a flat detour factor.

### Walking times on the OSM footpath network

**Done** (with group 8's PR): walks to the first stop, from the last stop and between stops follow real streets and paths from OpenStreetMap at 4 km/h (Hendrik's default; the menu's Gehtempo setting offers 3, 4, 5 or 6 km/h for walks to and from stops, while changes between stops stay at 4 km/h), so rivers, canals, rail lines and fenced areas now cost the detour to the next bridge or crossing. The build ships the network as `walk.bin` (2.1 MB gzipped, about 430k nodes), which the app loads in the background after the first map: the first map appears at once with straight lines and sharpens a moment later. Per tap the walking search costs about the same as the old straight-line spreading, so taps stay as fast as before. Instead of precomputed stop-to-cell tables, the browser runs one Dijkstra over the network per map, which was smaller to ship and exact. A monthly workflow refreshes the OSM data. Where nothing is within a 15-minute walk (outskirts, woods, fields, between lines), up to 30 minutes of walking are allowed so those areas are not left blank (Hendrik, 2026-10-11); the transit-desert layer keeps its 15-minute definition. The map opens at the current day and hour in Berlin.

Precompute walking times on the OpenStreetMap footpath network in timetable-build: from each stop to the grid cells around it (up to the 15-minute walking limit), and between nearby stops for transfers. Ship them as a compact file next to the timetables; the router reads walking times from it instead of straight-line distance.

Why it comes after groups 5 to 7: it is the largest item so far (several days, a new data pipeline), while groups 5 to 7 are quick and help every visit. Its value is high, though, so it comes before the new modes in group 9, which build on it (bike times on real streets).

Notes:

- Data: a Berlin/Brandenburg OSM extract (Geofabrik), filtered to walkable ways, refreshed with the monthly GTFS job.
- Size: roughly 45k platforms times nearby cells; with quantised times and delta encoding this should stay a few MB gzipped, downloaded once and cached. To be measured in a prototype first.
- Until then, a detour factor of about 1.3 on straight-line distances would be a one-line stopgap if the green next to barriers bothers anyone.

### Draw walks along the real footpaths

**Done** (PR #45): a tapped trip's walks (to the first stop, changes, from the last stop) follow the footpaths their minutes were measured on; a small search with predecessors runs per walk, only for the tapped trip. While `walk.bin` loads, walks stay straight.

When a trip is shown on tap, its walking parts (to the first stop, between stops when changing, from the last stop) are drawn along the streets and paths the walking time was measured on, instead of as straight dotted lines. So the drawn walk goes over the bridge or around the station block that the minutes already account for.

Notes: the footpath search in the worker already finds these paths; it only has to remember each node's predecessor so the path for the tapped trip can be traced back and sent with the trip. That is work for one trip per tap, not per map, so taps stay instant. While `walk.bin` is still loading (the first moment after opening), walks stay straight as today. Small effort; added from Hendrik's request on 2026-10-11 and placed before bike, which will draw its rides the same way.

## 9. More ways to travel

### Step-free mode

**Done** (PR #42): a "Stufenlos" switch in the menu (remembered, `sf=1` in the link, ♿ in the time pill) uses only routes whose trips are marked wheelchair-accessible and skips platforms that pathways.txt connects to the street only by stairs or escalators (111 in the VBB feed, e.g. U Moritzplatz): trains pass them without stopping and no walks lead there. Street stops without the data count as step-free. The worker keeps step-free timetables next to the normal ones (about 25 ms to prepare).

A switch that uses only stops and trips marked wheelchair-accessible in the VBB data, showing where travel with a pram, wheelchair or suitcase is much slower.

Notes: VBB GTFS has wheelchair_boarding for many stops and trips, but coverage may be patchy; check it before building. Medium effort.

### Bike + transit and bike only

**Done** (PR #47): a new "Unterwegs" choice in the menu: Zu Fuß (as before), Rad + Bahn (cycle at 15 km/h to the station and from the last stop, 2 min per station to take the bike along, no buses, cycling all the way where that is quicker) or Nur Rad (up to 60 min on streets and paths). Kept in links as `go=bike` / `go=bikeonly`; cycled legs of a tapped trip are drawn along the streets as a thin solid line.

A mode that cycles (about 15 km/h) to and from stations instead of walking, and a bike-only map for comparison. Taking the bike on the train and parking it can be a fixed time penalty.

Notes: the routing change is small; most effort is in the UI and defaults. Uses the street network from group 8 when available, a straight line with a detour factor otherwise. Large overall.

## 10. Performance

### Smaller, faster first load

**Done** (PR #50): timetables now ship as a binary file (268 KB instead of 717 KB gzipped per hour, decoded faster than JSON; the app falls back to JSON), and a tiny entry script starts the routing worker and the hour's timetable download before the rest of the app (mostly MapLibre) loads next to it. First map on a throttled phone: 4.7 s → 2.8 s.

First load is about 1.2 MB (JS about 300 KB gzipped plus one hourly timetable of 0.55–0.7 MB). If it becomes a problem: load the map style and timetable in parallel, move rarely used code (favourites import) into a lazy chunk, and store timetables in a binary format instead of JSON. Low priority now that the hourly files are smaller than the old Day file.

### Speed budget checked in CI (B1)

The snappiness rule is checked by hand in each PR today. A CI job fails a PR that makes things slower: gzipped JS size per chunk, timetable file size, and a headless timing of routing per origin in Node (packages/routing already has a bench), each against a stored baseline with some tolerance. Protects the USP automatically as features pile up. Medium effort. From suggestions-2, picked by Hendrik on 2026-10-12.

**Done** (PR #57): a CI job "speed" checks bundle sizes against `scripts/speed/budget.json`, and routing time and timetable size against main on the same runner.

### Split main.ts before the UI overhaul (B2)

`packages/web/src/main.ts` is over 2,000 lines without tests. Move URL state, the time sheet, the menu, the trip card and tap handling into their own modules, with tests for the URL round trip (`from`, `with`, `to`, `t`, `m`, `dir`, `cmp`, `walk`, `sf`, `go`, `layers`). Same behaviour, no speed cost; it makes the UI overhaul safer and is where the Android app's deep links will land. Medium effort. From suggestions-2, picked by Hendrik on 2026-10-12.

**Done** (PR #59): URL state lives in `url.ts` with round-trip tests for every link key; the time sheet, menu, tap handling, trip card and map layers are their own modules. main.ts is down to 962 lines.

### Timetable publish uploads only changed files

**Done** (PR #95): a checksum manifest is published and only changed files are uploaded. A same-day rerun takes 17 API calls instead of about 300, no file is ever missing during a publish, and the script stops before changing anything if the API budget is too low.

On 2026-10-12, a timetable build failed partway through publishing: GitHub's hourly API limit for the repo ran out, and because each file is deleted and re-uploaded (`--clobber`), one timetable file was left missing from the release. Each publish re-uploads all of the roughly 250 files, which nearly uses up the hourly budget, so two runs in one hour overflow it.

- Publish a checksums manifest with the release, and upload only the files whose hash changed. A same-day rerun then costs a handful of API calls.
- A failed run must never leave a file deleted. Upload the new file before the old one is replaced, or check the release against the manifest at the end.

Small effort, workflow only, no change to the app. Suggested by the builder on 2026-10-12 after the failed run.

### Instant hour changes: preload the next hour, tidy the offline cache

**Done** (PR #103): the next hour preloads in the background, and the offline cache keeps 12 timetables, dropping past days first. On a 4G profile with a 4× slower CPU, the map is ready 0.5–0.7 s after an hour step, instead of 0.9–1.4 s.

Hendrik picked this on 2026-10-12 as the next step (B5 + B4 from plan/suggestions-2.md).

- **Preload the next hour:** after the map is shown and the walking network is in, fetch the next hour's timetable (about 270 KB) in the background, so the most common change is instant. Only on Wi-Fi, or when the connection reports no data saver.
- **Offline cache tidy-up:** `packages/web/public/sw.js` keeps 6 timetable files, sized for the old JSON files, and since the real dates (PR #78) the file names change every day. Raise the limit to about 12, drop past days first, and bump `VERSION` if the file naming changed. This decides whether the app works offline in the morning.

Notes: nothing loads before the first map, so first load stays as fast as now. Measure an hour change before and after. Small effort.

## 11. What's running now

### Today's actual service, construction and Ersatzverkehr included

The map should show what is actually running, not a typical day. Today the build picks one reference weekday and one Saturday from a monthly VBB feed, so construction on those days is baked in for a month and everything else is missed. Instead:

- **Real days instead of a reference day:** refresh the VBB GTFS feed daily and build the hourly timetables for today and the next 7 days. Planned Ersatzverkehr (rail replacement buses), closures and construction timetables are already normal trips in VBB's feed, so they appear exactly on the days they happen.
- **"Now" means today:** the map opens at the current day and hour with that day's real service; the time sheet picks a date in the coming week ("Heute", "Morgen", weekday names) instead of only Werktag/Wochenende. "Typischer Werktag" stays as a choice for planning (moving house, favourites), and the compare view can put today against the typical day.

**Done** (PR #78): the two points above. Timetables are built for today and the next 7 days and rebuilt nightly; the time sheet picks Heute, Morgen or a weekday, keeps the typical Werktag/Wochenende for planning, and can compare with a typical day. Still open: the two points below, each its own step.

- **What's different today:** a build-time comparison of each day against the typical pattern lists the affected lines in a small notice ("U2: Ersatzverkehr Pankow–Alexanderplatz, bis 20.10."); tapping it shows the stretch on the map.
- **Live disruptions, second step:** short-notice changes (cancellations, sudden closures) are not in the static feed. Check whether VBB now offers an open real-time feed (GTFS-RT); if not, show current disruption notices as text from VBB's public journey API, without routing on them.

**Done** (PR #88): What's different today. Each day is compared with the typical pattern at build time, and a small notice lists the lines that run differently.

**Finding for live disruptions** (builder, 2026-10-12): VBB's GTFS-RT feed exists but carries no notices, only delays and cancellations of single trips (about 2.4 MB per download), and the journey API has no network-wide notices either, so "disruption notices as text" is not available. Hendrik is choosing between: A) skip it, B) a live check of the tapped trip ("fällt aus" / "+4 Min."), C) a network-wide list of cancellations. B is being built until he decides.

**Done** (PR #90): live disruptions as option B. The tap card shows the live status of the first vehicle of the chosen trip, from VBB's GTFS-RT feed.

### "Heute anders" in the chosen connection

**Done** (PR #98): the trip card notes on a leg when its line runs differently today. The PR also stops each deploy from using about 300 API calls.

Hendrik, 2026-10-12: what is different today should count in the connection you pick, and if that is too costly, at least the information that matters for that connection should show. Since PR #78 the routing already uses each day's real timetable, so planned changes (Ersatzverkehr, closures) are already in the connections it finds. This step is about what the user sees:

- **On the trip card:** when a line in the chosen connection runs differently today, say so on that leg, for example "U2: Ersatzverkehr Pankow–Alexanderplatz". This uses the same build-time comparison as the notice from PR #88.
- **The general notice** then only lists the changes that touch the map you are looking at, or steps back, so it no longer shows things that don't matter for your trip.
- If counting the changes in routing turns out not to be the case somewhere (for example the "Typisch" times, which use the typical day), only the per-connection information shows there.

Small to medium effort. Added from Hendrik's request on 2026-10-12.

Notes: the app still downloads only the hour it shows (about 270 KB with the binary format), so first load and taps stay as fast as now; the release grows to about 8 days × 24 files, which is fine for GitHub Pages. The daily refresh runs in the existing GTFS workflow. Medium effort; reworked from Hendrik's request on 2026-10-12 (previously "Ersatzverkehr and other temporary changes" with only a reference-day fix).

## 12. UI overhaul

### Bring all the features together: a chip row under the search (option B)

**Done** (PR #92): chip row with small panels, slim vertical legend, "2. Start" button, Mo–Fr / Sa+So, checked at 360×740 in German and English. With the colour fill off, its image is only painted once switched on, so a map takes about 0.7 s instead of 0.9–1.1 s.

Many features have been added one by one and are now spread across the top bar, the menu and the time sheet. Hendrik picked **option B** of three rendered designs (2026-10-12; mockup `web/ui-options/option-b-schalter-oben.png` in the project files):

- **Chip row under the search:** one row of chips shows at a glance what is set: **Zeit** ("Werktag 10 Uhr"), **Unterwegs** ("Zu Fuß"), **Reisezeit** ("Typisch"), **Ebenen**, **Stufenlos**, **Vergleich**. The row scrolls sideways when it doesn't fit. A chip that differs from the default turns purple, so e.g. Rad + Bahn or Stufenlos is visible at once.
- **Each chip opens a small popover** with only its own settings, directly under the row, while the map stays visible: Zeit has the day, hour, Losfahren/Ankommen (and later the dates from group 11); Unterwegs has Zu Fuß / Rad + Bahn / Nur Rad, Gehtempo and Stufenlos; Reisezeit has Typisch / Bestfall / Nächste; Ebenen has Lines, outlines, stop frequency, transit deserts and opacity; Vergleich picks the second time. A tap outside closes it.
- **Day labels:** "Werktag" becomes **Mo–Fr** and "Wochenende" **Sa+So**, in the Zeit chip and its popover (English: Mon–Fri, Sat+Sun). The weekend timetable is a Saturday, so Sunday mornings, which run less often, can look a little better than they are; group 11's real dates remove that difference. (Hendrik, 2026-10-12.)
- **The menu keeps only** Orte (favourites), Teilen, Sprache and Info.
- **Slim vertical legend:** a thin colour bar (about 9 px) on the right edge, 0 at the top to 120+ at the bottom, haloed tick labels, no box or frame. It replaces the legend panel at the bottom (from the visual polish step), so the trip card no longer carries it.
- **Load order:** check that the elements appear in a sensible order on first load: base map, start point and outlines first (the default view), then the controls; the colour fill and its legend are off by default, so they load later, in the background or when "Farben (Heatmap)" is first switched on. Nothing the default view doesn't show should hold up the first map. (Hendrik, 2026-10-12.)
- **Bottom:** the tap info card stays at the bottom (minutes, line, walking, Maps link, Hier starten / 2. Start / ★ Merken, ✕); with no card shown, a "2. Start" button sits bottom right. Top buttons (menu, search, locate) stay round as now.

Notes: layout and CSS on the existing controls, no new data, so no cost to taps or first load; the popovers are plain DOM, opened instantly. Check at 360×740 and on an iPhone-sized screen, in German and English (chip labels must fit). Large effort. Added from Hendrik's request on 2026-10-11, filled in from his pick on 2026-10-12.

### Chip bar rearranged

**Done** (PR #108): the menu is a ≡ chip, placed first in the bar rather than last, because at 360 px the row scrolls and a last chip would be out of view. Search and locate sit under the bar, the transit chip reads "Bahn", Barrierefrei is in its panel, and Reisezeit is in the Zeit panel. First map about 0.5 s.

Hendrik, 2026-10-12: the horizontal chip bar from PR #92 is good, but rearrange it:

- **Menu into the bar:** the burger menu becomes a chip at the end of the bar, called something like "Mehr" (English: "More"), opening the same items (Orte, Teilen, Sprache, Info).
- **Search and locate below the bar:** the search and "my location" buttons move from the top row to just under the chip bar.
- **"Zu Fuß" becomes "Bahn":** the Unterwegs chip is labelled "Bahn" (English: "Transit") while public transport plus walking is chosen. Its panel keeps Rad + Bahn, Nur Rad and Gehtempo.
- **Stufenlos leaves the bar** and stays only inside that chip's panel, renamed **Barrierefrei** (English: "Step-free" stays, or "Accessible").
- **Reisezeit moves into Zeit:** Typisch / Bestfall / Nächste become part of the Zeit chip's panel, so the bar has one chip fewer.

Notes: layout only; the URL parameters stay the same, so shared links keep working. Check at 360×740 in German and English. Small to medium effort.

### Chip bar round two

**Done** (PR #111): the top bar reads search, the scrolling chips, then "Mehr" last. Vergleich is in the Ebenen panel, locate sits bottom left, and "Startpunkt" / "Starting point" is used everywhere. Links are unchanged.

Hendrik, 2026-10-12, after seeing PR #108 live:

- **Menu chip last, called "Mehr":** the ≡ chip moves to the end of the bar and is labelled "Mehr" (English: "More"). This reverses the PR #108 choice of putting it first.
- **Vergleich into Ebenen:** the Vergleich chip leaves the bar; comparing two times becomes part of the Ebenen panel.
- **Search first:** the search button is the first item of the top bar.
- **Locate at the bottom:** the "my location" button moves to the bottom of the screen.
- **"Startpunkt" everywhere:** every "Start" label becomes "Startpunkt" (buttons, trip card, hints, the "2. Start" button), with English to match ("Starting point").

Notes: layout and labels only; URL parameters stay the same. Check at 360×740 in German and English that the bar and the bottom row fit. Small effort.

### First view without flicker

**Done** (PR #111): checked on slow 4G with a 4× slower CPU, nothing is shown and then hidden. The legend, the hint, the attribution and "Heute anders" stay out of the first view, and chip labels appear only once filled in. First map about 0.4–0.6 s.

Hendrik, 2026-10-12: on first load the "Heute anders" frame still appears, and some elements that are not part of the default view are loaded, shown and then switched off. Optimise so that:

- Nothing that the default view doesn't show is ever painted, even briefly: elements start hidden and are only shown once they are known to be needed.
- The "Heute anders" notice no longer appears on its own in the first view (since PR #98 the information belongs on the trip card).
- Elements needed only later load in the background or on first use, as in the load-order rule of the UI overhaul.

Notes: check with a slowed-down network and CPU that the first frames show only base map, start point, outlines and the bar. No cost to the first map; it may get faster. Small effort.

### Top bar polish

**Done** (PR #114): the whole top bar scrolls, with search first and "Mehr" last as a plain chip with a drop-down indicator; "Heute anders" sits directly above the trip card. Checked at 360×740 in German and English; the first view stays flicker-free.

Hendrik, 2026-10-12, two minor fixes after PR #111:

- **One scrolling bar:** every item of the top bar, the search included, is part of the one horizontally scrolling bar; nothing stays fixed beside it.
- **"Mehr" like the others:** the "Mehr" chip loses its ≡ symbol and looks like the other chips, with the drop-down indicator next to its label.
- **"Heute anders" above the trip card:** the "Heute anders" note appears directly above the connection info box at the bottom, not elsewhere on the screen.

Notes: layout only, URL parameters unchanged; check at 360×740 in German and English, and keep the flicker-free first view from PR #111. Small effort.

### Edge-to-edge top bar and slim loading bar

**Done** (PR #120): the top bar runs edge to edge; the "Berechnen" / "Berechnet in" texts are gone and a 2 px loading bar at the bottom edge disappears when done. Checked at 360×740 in German and English; the first view stays flicker-free.

Hendrik, 2026-10-12, two minor fixes before anything else:

- **Top bar edge to edge:** the top bar reaches the left and right edges of the screen.
- **Slim loading bar instead of popups:** the "Berechnen …" and "Berechnet in …" info popups go away. Instead a very slim loading bar is overlaid at the bottom of the screen and disappears once everything has loaded.

Notes: layout only, URL parameters unchanged; check at 360×740 in German and English, and keep the flicker-free first view from PR #111. Small effort.

### Calmer default map (option B)

**Done** (PR #129): in the outlines-only view the time lines are soft, solid and blurred; rail, highway shields and minor roads are hidden at city zoom and the Ring is a faint band. The heatmap view is unchanged; the first view stays flicker-free.

Hendrik, 2026-10-12: option B from the clean-map mockups (plan files under web/clean-map/, b-soft.png), "but normal lines instead of dashed lines", and the time lines a bit wider and blurred. All paint and filter changes in packages/web/src/map-layers.ts:

- **Quieter base map:** the base map's railway and highway shield layers are hidden; minor roads appear from zoom 12; road opacity 0.3 at zoom 10, 0.55 at 12, 1 at 14.
- **Soft Ring:** the Ring is a soft wide band (opacity 0.1, width 4 to 10); landmarks appear from zoom 12.
- **Solid, soft time lines:** in the outlines-only view the lines are solid, not dashed. The 30/60/90-minute lines get width 4 to 6, blur 2.5 to 3.5, opacity 0.75; the 10/20-minute steps width 2.5 to 4, blur 2 to 3, opacity 0.45. Label spacing 260.

Notes: paint only, URL parameters unchanged; check at 360×740 in German and English and keep the flicker-free first view. Small effort.

### Time-line widths closer together

Hendrik, 2026-10-12, after PR #135: the 30-minute lines can be a bit thinner and the 10-minute step lines a bit thicker; the difference doesn't need to be that big.

Notes: paint only, URL parameters unchanged; check at 360×740 in German and English. Small effort.

### Stronger transit lines, softer minute lines

**Done** (PR #135): the minute lines are thicker and more blurred; while a trip is shown the transit lines step back only to 50 % instead of 30 % (without a trip they stay fully opaque).

Hendrik, 2026-10-12, after the calmer default map: the public-transport lines on the map get a bit more opacity, and the minute (time) lines get thicker and more blurred.

Notes: paint only in packages/web/src/map-layers.ts, URL parameters unchanged; check at 360×740 in German and English and keep the flicker-free first view. Small effort.

### Rename to "Wohin jetzt?"

**Done** (PR #134): "Wohin jetzt?" is the tab title (with the tagline), the installed-app name, and the menu and About headings, with the tagline under About (English "Transit in one tap"); both sharepics re-rendered. Address and URL parameters unchanged.

Hendrik, 2026-10-12: the app is called **"Wohin jetzt?"** with the tagline **"Öffis mit einem Tap"** (English: "Transit in one tap"), replacing "Berlin in Minuten" / "Berlin Transit". The rename covers the title in the app, the installed-app (manifest) name, the About text and the sharepics.

Notes: names only, URL parameters and the address unchanged (the domain is still open in the beta plan). Check at 360×740 in German and English. Small effort. Hendrik gave the go on 2026-10-12.

## 13. Wider area and other regions

### Potsdam and the commuter belt (C6)

**Done** (PR #69): the map covers 12.90–13.92 E, 52.27–52.80 N, so Potsdam, Bernau, Oranienburg, Königs Wusterhausen and Erkner are inside. Footpaths and timetables for the wider area come from a fresh OSM and timetable rebuild after the merge. The heatmap image is now one 50 m pixel per cell (it looks the same), and the outlines are traced at half resolution.

The covered rectangle is 13.05–13.80 E, 52.33–52.70 N (timetable-build/src/geo.ts). Potsdam's centre sits right on the western edge, and Bernau, Oranienburg, Königs Wusterhausen and Erkner are outside, though many people commute from there. Widen the area to include them.

Notes: a larger area means bigger timetables and walking network and more cells per tap, so measure first against the snappiness rule (and the CI speed budget from B1); a possible middle way is the wider area at a coarser grid outside Berlin. Medium effort. From suggestions-2, picked by Hendrik on 2026-10-12.

### Other regions, Oldenburg / Weser-Ems first

Hendrik, 2026-10-12: add other regions, the first one Oldenburg / Weser-Ems. **Decided (Hendrik, 2026-10-12): both**, one app with each region at its own address. Details and sources in plan/regions.md.

- **Addresses:** each region has its own address, `…/berlin/` and `…/oldenburg/`, with its own manifest, name and icon, so each installs as its own app on the phone. A region switch in the menu moves between them. The root address forwards to `/berlin/` with the same parameters, so old links keep working.
- **One codebase, one deploy:** the build writes one data folder per region; each address loads only its own data, so the first map stays as fast as now.
- **Timetables:** the Connect GTFS feed (Niedersachsen + Bremen). Its licence and download access still need checking before the build relies on it. Walking paths from the Geofabrik Niedersachsen and Bremen extracts, cut to the region's box.
- **Area:** Oldenburg plus about 40 km around it, including Bremen. It can grow later.
- **Name:** "Oldenburg in Minuten".
- **Berlin-only extras:** Oldenburg starts without live status and without Ring, Bezirke and landmarks. Water, parks and streets work anywhere. Oldenburg landmarks and VBN real-time can follow as their own items.
- **Stored on the phone:** favourites and recent places are kept per region, so switching doesn't mix them.
- **Builds:** each region has its own nightly build and release tag, run at different times so the release rate-limit problem doesn't return.

**Split (Hendrik, 2026-10-12: prep only).** The work is built in two parts:

1. **Region-ready code (prep), Done** (PR #126): Berlin is one entry in `packages/routing/src/regions.ts`, read by the app, the timetable build and the workflows; data is served from `data/berlin/`; favourites and recent places are stored per region and existing lists moved over. Nothing visible changed and the first map is as fast as before. Planned as: a region config holding everything that is Berlin-specific today (area box, map start point, names, timetable and walking-path sources, Berlin-only extras such as Ring, Bezirke, landmarks and live status), data loaded from a folder per region, and favourites and recent places stored per region, with existing Berlin favourites kept. Berlin stays the only region and keeps its current address; nothing visible changes and the first map is no slower.
2. **Region addresses and Oldenburg, held:** the `/berlin/` and `/oldenburg/` addresses, the forward from the root address, the region switch, and the Oldenburg data and build. Not started until the domain and the timetable feed account are settled (the app name is settled: "Wohin jetzt?").

Notes: measure against the snappiness rule and the CI speed budget. The prep is medium effort; part 2 is large and may itself be split (addresses, then Oldenburg data, then the region switch).

## 14. Android app

### Beta readiness

Hendrik, 2026-10-12: make the app ready for beta testing. **Blocked:** this is not started until Hendrik has explicitly agreed to the full approach. Suggestions for what to do are being drafted in a separate thread first; once he has agreed, the agreed plan replaces this paragraph and the steps are queued in Up next.

**Postponed** (Hendrik, 2026-10-12): not started yet and not planned any time soon.

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

Suggested path: start with a TWA, test it with a direct APK on Hendrik's phone, then publish to Google Play; move to Capacitor only when a native feature is needed. Placed last by Hendrik (2026-10-12), so the app ships with the reworked interface and the current-service timetables.
