# Roadmap

Ideas queued after the alpha (live at https://hendrikkintscher.github.io/berlin-transit-heatmap/). Items marked Done are live and kept as one line each; their full write-ups are in archive/plan/roadmap-full-2026-10-12.md (project files). Groups 1–10 are done apart from items added later in groups 3, 6, 7 and 10. Groups 5–10 come from reviews of the live app, group 11 is today's actual service, group 12 the UI overhaul, group 13 the wider area and other regions, group 14 the Android app, postponed with no date (Hendrik, 2026-10-12), group 16 app store releases and showcase material, not started, and group 17 the review track. Items from the second suggestions list (archive/plan/suggestions-2.md) keep their ids (B1, C1 …). Within a group, items that others depend on come first. The **Up next** list below is the build order; the builder takes the first open entry.

## Inbox

Hendrik's instructions land here, written by the coordinator into plan/roadmap.md (project files): one dated line each, in his words. The roadmap editor and the Review negotiator check this section at the start of every turn and before naming each next step, move each line to its place in the roadmap (review-track items go to the Review negotiator), and remove it from here.

_Empty._

## Up next

State on 2026-10-12, live through PR #193. Build in this order, one step per PR:

1. Shorter platform changes (group 6): built and merged (PR #184); goes live with the next timetable build, after PR #185 and not before 23:18 UTC.
2. **Next:** Lighter work per tap (B6, group 15)
3. Background downloads after the basemap, no timetable fetch without a start (P1 + P2, B4 follow-up, group 15)
4. Smaller Wohnlage-Karte memory (B7, group 15)
5. Typical timetable when offline (B8, group 15)
6. Notice, search and favourites polish (C5–C8, group 15)
7. Broader CI checks and a sturdier timetable build (B9 + B10, group 15)
8. Default view readability: two variants to compare (C9, group 15)
9. Named starts in meeting mode (D2, group 15)
10. Code health, no change in behaviour (E1, group 15)
11. Smaller walking network file (P8, group 15)

From Hendrik on 2026-10-12, to be built now. After these, Hendrik picks the next step before anything starts. Items from the third suggestions list (plan/suggestions-3.md) are added here as he picks them.

**Review track** (Hendrik, 2026-10-12): four reviews in group 17, run in parallel (reviews done, picks pending with Hendrik) by their own pair of threads, a "Review negotiator" and a "Review builder", not by the builder queue above. Their status changes are marked here as that pair reports them.

**Proposed, not picked:** less walking on equal arrival (group 6, from the connection test). Hendrik picked the other two fixes ("Both fixes", 2026-10-12) and parked this one.

**On the roadmap, not started** (Hendrik, 2026-10-12: "Only add to roadmap, don't start working on it"): trip drawer with more connections, and a detailed connection view (group 6). They wait until Hendrik picks them.

**Added, not started** (Hendrik, 2026-10-12): Android and iOS app store deployment, and showcase material (group 16). Not in Up next until Hendrik picks them.

**Held:** the region addresses (`/berlin/`, `/oldenburg/`) and the Oldenburg data (group 13), until the domain and the timetable feed account are settled.

**Blocked until Hendrik agrees:** Beta testing readiness (group 14). The plan is written down there (packages A, B and C, plus the address choice); nothing starts until Hendrik explicitly agrees to a package and an address. **Postponed:** Android app (group 14). Hendrik, 2026-10-12: not starting it yet or any time soon; it stays unstarted until he picks it up again.

General rule (Hendrik, 2026-10-12): instructions go into the roadmap only, through the Inbox above. The roadmap agents find them there and rearrange the roadmap to fit them in; the editor (or, for group 17, the Review negotiator) hands an item to its builder only when it judges it the next thing to do. Builders take work only from their editor or negotiator.

Working rule (Hendrik, 2026-10-12): once the queued steps are done, he picks each next step himself; the editor confirms the pick to the builder. Important decisions on the way go to Hendrik as multiple choice.

**Not planned** (Hendrik, 2026-10-12): these were offered as next steps and set aside. They stay listed in archive/plan/suggestions-2.md and are not built unless Hendrik brings them back.

- Fare zones: AB/C boundary on the map and a "C-Ticket nötig" note on the trip card (C5)
- Share a picture of the map instead of a link (C7)
- Who can I reach: "In 30 Min.: 41 % der Berliner, 210 km²" from the Zensus grid (C4)
- Dark map in dark mode and app shortcuts on the installed app (C9)

**Ground rule: snappiness is the app's USP.** A tap must keep answering at once, on a phone too. No feature may slow down taps, panning or the first map; anything heavy is precomputed in the build, loaded in the background, or optional.

## 1. Interface and usability

Small changes to the app shell. They make room for everything below, so they come first.

- **Burger menu**: Done (PR #15): the menu button sits next to search and opens a panel with the Lines switch, the language switch and the About text.
- **German by default, English switch**: Done (PR #15): the app opens in German.
- **Address search limited to the covered area**: Done (PR #15): suggestions are limited to the heatmap's area (Berlin plus a narrow edge, the same rectangle the map is computed for), both in the Photon query and again on the device.
- **Snappier address search**: Done (PR #96): the first suggestion shows about 0.14 s after typing, instead of 1.9–2.7 s.
- **Fix: street names in every search box**: Done (PR #142): a built-in list of about 20,000 street names (0.22 MB, loaded only when search opens and then cached) gives street suggestions within about 40 ms in every search box, ….
- **Addresses in the search suggestions**: Done (PR #122): street rows appear in the suggestions, one per postcode with the district.

## 2. New map layers

Extra layers you turn on and off in the burger menu.

- **Stop-frequency layer**: Done (PR #16): a menu switch draws a dot per station, coloured and sized by departures per hour (all platforms, lines and directions), for the Day or Night window.
- **Transit-desert layer**: Done (PR #16): a menu switch shades places by access time, the walk to a stop plus the average wait there (half the gap between departures), counted per platform.

## 3. Comparing places

Features that answer "how good is this location for me (or us)?".

- **Meeting point: intersect two start points**: Done (PR #17): after setting a start, tap another place and choose "2. Start". The map then shades each spot by the slower of the two trips, a banner explains it and removes the second ….
- **Suggested meeting points**: Done (PR #35): with two starts, up to three stations (6+ departures an hour) with the smallest slower-of-both time, the sum as tie-breaker and at least 1.5 km apart, show as numbered ….
- **Search result: new start, destination or second start**: Done (PR #35): with a start set, a picked search result shows the trip there with "Neuer Start", "2. Start" and "★ Merken" instead of replacing the start.
- **Meeting point scale in extra minutes**: Done (PR #37): with two starts, the colours and outlines show extra minutes over the best slower-of-both time on the grid.
- **Favourite places and a location score**: Done (PR #17): the menu holds a list of favourite places, added by address search, by "★ Merken" on any tapped spot, or imported from Google Takeout (Saved Places .json, saved-list .csv.
- **Meeting point for three or more people (C1)**: Done (PR #64): up to five starts, each with its own colour.
- **"Lieblingsort" toggle instead of "Merken"**: Done (PR #118): the trip card shows ☆/★ "Lieblingsort" ("Favourite place" in English).
- **Fairer meeting point suggestions**: Done (PR #93): suggestions rank by slowest trip + average trip.
- **"Where can I live?" map from my favourites (C2)**: Done (PR #64): the Wohnlage-Karte in the menu, under the favourites, combines one Typisch "arrive" pass per favourite into the weighted average per cell (unreachable counts as 120 ….

## 4. Time of day and weekends

- **Hour-of-day selector and weekend switch**: Done (PR #18): the clock button in the top bar opens a picker with Werktag/Wochenende and the 24 hours.
- **Exact minutes and "Jetzt" in the time sheet**: Done (PR #160): the Zeit panel has a Jetzt button and an Uhrzeit field for an exact minute.

## 5. Everyday use on the phone

Small additions that make the map quicker to use day to day. All are small (an afternoon each), so they come before the bigger accuracy work. Order: what people use most first.

- **"Mein Standort" button**: Done (PR #21): a locate button in the top bar sets the start at the phone's position.
- **Share button**: Done (PR #21): the first button in the menu shares the current link through the phone's share sheet, or copies it.
- **Heatmap transparency slider**: Done (PR #21): a slider in the menu (15–95 %, remembered on the device).
- **Isochrone outlines**: Done (PR #21): a menu switch draws outlines at 15, 30 and 45 minutes (bolder for shorter times, labelled), traced from a smoothed grid.
- **Data freshness note**: Done (PR #21): the menu names the timetable day and says that engineering works and disruptions are not included.
- **Install hint and first-run help**: Done (PR #21): after the first map, a hint explains tapping and dragging.
- **Small polish**: Done (PR #21): the status line fades after 5 seconds, wide screens show the app title, and a dashed frame marks the computed area.
- **Thin 5-minute outlines**: Done (PR #23): the outlines switch now draws a thin line every 5 minutes up to an hour, with 15, 30 and 45 bolder and labelled.
- **Blending the heatmap with the streets**: Done (PR #23): the colours now sit under the basemap's roads, so streets show as white lines on top (faint in the city view, full strength from street level).
- **Visual polish: round buttons, legend and info box at the bottom, clearer ✕**: Done (PR #40): the top buttons are true circles.

## 6. Trips you can trust

Features that explain and sharpen the travel times. Each is a day or two of work and reuses the router as it is; together they turn the heatmap from a colour picture into something you act on.

- **Show the trip on tap**: Done (PR #24): tapping a place lists the connection under the minutes (changes, walking minutes, each line with its first and last stop) and draws it on the map, rides in line colours ….
- **Typical time instead of best case**: Done (PR #24): the map now shows the typical time by default (averaged over leaving at any minute in the hour, waiting included).
- **"Nächste": the next connection from now**: Done (PR #32): "Nächste" is the third Reisezeit choice.
- **Start on "Nächste", earliest arrival on tap, Typisch for meeting points**: Done (PR #62): the app opens on "Nächste"; a link carrying `m=` keeps its setting (`m=typical` is now named in links).
- **Tap card: leave in X min, arrival time, trip duration**: Done (PR #85): the card shows the trip's duration and arrival time, with "los in X Min." or "jetzt los" beneath, counting down live and moving to the following connection once this one ….
- **"Ankommen bis": travel times to a place**: Done (PR #24): the time sheet has "Losfahren" and "Ankommen"; arriving colours how long it takes from everywhere to the start point, arriving within the chosen hour (`dir=arr`).
- **Compare two times**: Done (PR #24): "Vergleichen mit" in the time sheet picks a second day and hour.
- **The tapped place stays when settings change**: Done (PR #55): the tapped place stays through a change of hour, measure, direction, travel mode, step-free, walking speed, language, layers or a moved start.
- **"Bis wann komme ich heim?": the last connection home (C3)**: Done (PR #66): from the start card (🌙 Bis wann heim?) or a favourite's 🌙, the map colours every place by the latest departure that still gets you home fast, over the evening and night ….
- **Remove the Google Maps links**: Done (PR #145): the trip card has no Google Maps link anymore, and the vs-Google sharepic no longer mentions one.
- **Real arrival times at stops**: Done (PR #183): the timetable file (format v2) stores per-stop dwell, so getting off uses the arrival time and boarding the departure; +0.8 % gzipped, routing speed unchanged; 6 of the 20 connection-test trips arrive 1–5 min earlier; taps 0.39–0.46 s live.
- **Start point or destination switch**: Done (PR #187): a "Start ⇄ Ziel" pill on the trip card (EN "Start ⇄ End") with the set place's current role in bold; it drives the same direction as Losfahren/Ankommen (`dir=arr` kept in the link); taps 240–320 ms, switch 0.8–1.2 s live.

### Shorter platform changes

Built and merged (PR #184), live with the next timetable build: island platforms get 60 s, timed transfers count as 0 s, and route-tied rows apply where no general row exists (533 transfers shorter). Picked by Hendrik on 2026-10-12 ("Both fixes"). From the connection test, finding 4. Platforms of one station get 120 s when the footpaths don't connect them, which is common for S-Bahn platforms, while BVG plans some changes in 1 minute (S8 → S25 at Bornholmer Str.). Use realistic platform transfer times and honour the timetable feed's transfer rules that are tied to routes (6,760 rows) and timed transfers (2,489 rows).

### Less walking on equal arrival (low priority)

Parked by Hendrik on 2026-10-12. From the connection test, finding 5. When two trips arrive at the same time, prefer the one with less walking or leaving later; today the earliest departure wins, for example an earlier tram from a farther stop. Cosmetic, and a reverse pass would cost time on every tap, so it is only built if it keeps taps as fast as now.

### Trip drawer with more connections

Hendrik, 2026-10-12 (roadmap only, not to be started until he picks it): "instead of the box showing the connection, we have a drawer instead, when drawn upwards we see more connections, rearrange the buttons on the connection box/drawer". The trip card becomes a drawer at the bottom: collapsed it shows the connection as today, pulled up it lists further connections (later departures or alternatives), and its buttons are rearranged for the drawer. Builds on trip card B (PR #174).

### Detailed connection view

Hendrik, 2026-10-12 (roadmap only, not to be started until he picks it): "when tapping on a connection, we get a more detailed description of the connection: wait time at stops in between etc." Tapping a connection opens a detailed view: each leg with its stops, times, the wait at each change, and walking minutes. Pairs with the trip drawer and with real arrival times at stops.

## 7. Reading the map

From Hendrik's review of group 6: the tapped route looks too much like the Lines layer, the colours still hide too much of the base map to tell which part of Berlin you are looking at, and at street level it should be easy to pick an exact street or address. These continue the blending work from group 5. Each is small to medium and helps every visit, so they come before the footpath work. Order: smallest and most visible first.

- **Tell the route apart from the Lines layer**: Done (PR #27): while a route is shown the Lines fade to 30 % without labels.
- **Smooth line overlays along the real tracks and roads**: Done (PR #99, #102): U-Bahn, S-Bahn and tram lines and the drawn trips follow the real tracks from VBB's GTFS shapes (lines.bin, about 0.16 MB gzipped, loaded after the first map).
- **Shown connection without a black border**: Done (PR #108): the ride legs keep their line colours and width, with no border.
- **Orientation: which part of Berlin am I looking at?**: Done (PR #27): water (rivers, canals, lakes) is drawn over the colours in clear blue.
- **Street level: pick an exact street or address**: Done (PR #27): the colours fade from zoom 13 to 45 % of the chosen opacity at zoom 16; house numbers from zoom 17 (max zoom now 18).
- **Shorter tap info**: Done (with group 8): the info window shows just the minutes. The measure and time ("typisch, Werktag 10–11 Uhr") are already in the top bar, so Hendrik had them removed from the tap readout.
- **Calmer street level: footpaths next to streets**: Done (PR #73): the tiles carry no sidewalk tag, so footways and cycleways are drawn thin and faint.
- **Heatmap colours off by default**: Done (PR #71): the map opens with the outlines only, each in its legend colour on a white edge and every line labelled with its minutes.
- **Fainter default outlines: one colour, 10-minute steps**: Done (PR #76): without the colour fill, outlines come every 10 minutes in a single hue, darkest near the start, thinner and partly transparent, each labelled.
- **Outlines view: dashed lines, more labels, clearer gradient, no legend**: Done (PR #81): with the colour fill off, the 10-minute outlines are dashed, their minutes repeat about twice as often, the single hue runs from near-black purple to pale lilac, and the ….

## 8. Realistic walking on real footpaths

Walking is measured today as a straight line at 1.2 m/s, to the first stop and from the last. Across the Spree, rail corridors, canals, cemeteries and the edges of Tempelhofer Feld the real walk is much longer, so the map is too green next to barriers. Hendrik chose the proper solution over a flat detour factor.

- **Walking times on the OSM footpath network**: Done (with group 8's PR): walks to the first stop, from the last stop and between stops follow real streets and paths from OpenStreetMap at 4 km/h (Hendrik's default; the menu's Gehtempo setting offers 3, 4, 5 or 6 km/h for walks to and from stops, while changes between stops stay at 4 km/h), so rivers, canals, rail lines and fenced areas now cost the detour to the next bridge or crossing. The build ships the network as `walk.bin` (2.1 MB gzipped, about 430k nodes), which the app loads in the background after the first map: the first map appears at once with straight lines and sharpens a moment later. Per tap the walking search costs about the same as the old straight-line spreading, so taps stay as fast as before. Instead of precomputed stop-to-cell tables, the browser runs one Dijkstra over the network per map, which was smaller to ship and exact. A monthly workflow refreshes the OSM data. Where nothing is within a 15-minute walk (outskirts, woods, fields, between lines), up to 30 minutes of walking are allowed so those areas are not left blank (Hendrik, 2026-10-11); the transit-desert layer keeps its 15-minute definition. The map opens at the current day and hour in Berlin.
- **Draw walks along the real footpaths**: Done (PR #45): a tapped trip's walks (to the first stop, changes, from the last stop) follow the footpaths their minutes were measured on.

## 9. More ways to travel

- **Step-free mode**: Done (PR #42): a "Stufenlos" switch in the menu (remembered, `sf=1` in the link, ♿ in the time pill) uses only routes whose trips are marked wheelchair-accessible and skips platforms ….
- **Bike + transit and bike only**: Done (PR #47): a new "Unterwegs" choice in the menu: Zu Fuß (as before), Rad + Bahn (cycle at 15 km/h to the station and from the last stop, 2 min per station to take the bike along, ….

## 10. Performance

- **Smaller, faster first load**: Done (PR #50): timetables now ship as a binary file (268 KB instead of 717 KB gzipped per hour, decoded faster than JSON; the app falls back to JSON), and a tiny entry script starts ….
- **Speed budget checked in CI (B1)**: Done (PR #57): a CI job "speed" checks bundle sizes against `scripts/speed/budget.json`, and routing time and timetable size against main on the same runner.
- **Split main.ts before the UI overhaul (B2)**: Done (PR #59): URL state lives in `url.ts` with round-trip tests for every link key.
- **Timetable publish uploads only changed files**: Done (PR #95): a checksum manifest is published and only changed files are uploaded.
- **Instant hour changes: preload the next hour, tidy the offline cache**: Done (PR #103): the next hour preloads in the background, and the offline cache keeps 12 timetables, dropping past days first.

## 11. What's running now

- **Today's actual service, construction and Ersatzverkehr included**: Done (PR #78): the two points above.
- **"Heute anders" in the chosen connection**: Done (PR #98): the trip card notes on a leg when its line runs differently today.

## 12. UI overhaul

- **Bring all the features together: a chip row under the search (option B)**: Done (PR #92): chip row with small panels, slim vertical legend, "2. Start" button, Mo–Fr / Sa+So, checked at 360×740 in German and English.
- **Chip bar rearranged**: Done (PR #108): the menu is a ≡ chip, placed first in the bar rather than last, because at 360 px the row scrolls and a last chip would be out of view.
- **Chip bar round two**: Done (PR #111): the top bar reads search, the scrolling chips, then "Mehr" last.
- **First view without flicker**: Done (PR #111): checked on slow 4G with a 4× slower CPU, nothing is shown and then hidden.
- **Top bar polish**: Done (PR #114): the whole top bar scrolls, with search first and "Mehr" last as a plain chip with a drop-down indicator.
- **Edge-to-edge top bar and slim loading bar**: Done (PR #120): the top bar runs edge to edge.
- **Calmer default map (option B)**: Done (PR #129): in the outlines-only view the time lines are soft, solid and blurred.
- **Time-line widths closer together**: Done (PR #139): the 30/60/90-minute lines are now 4.5 to 6.5 wide and the 10-minute steps 4 to 6.
- **Stronger transit lines, softer minute lines**: Done (PR #135): the minute lines are thicker and more blurred.
- **Rename to "Wohin jetzt?"**: Done (PR #134): "Wohin jetzt?" is the tab title (with the tagline), the installed-app name, and the menu and About headings, with the tagline under About (English "Transit in one tap").
- **Permanent search bar at the top**: Done (PR #153): the search field sits permanently at the top.

- **Redesign of the time sheet and the trip card**: Done (PR #174): time panel A (Jetzt, +15/+30/+60, Losfahren/Ankommen next to the exact time, days, Reisezeit, hours) and compact trip card B (one icon row, stops under Details, meeting trips folded), with C2, C3, C4, D3, C11 and the C10 minimums; tap 0.46 s live.

## 13. Wider area and other regions

- **Potsdam and the commuter belt (C6)**: Done (PR #69): the map covers 12.90–13.92 E, 52.27–52.80 N, so Potsdam, Bernau, Oranienburg, Königs Wusterhausen and Erkner are inside.

### Other regions, Oldenburg / Weser-Ems first

Hendrik, 2026-10-12: add other regions, the first one Oldenburg / Weser-Ems. **Decided (Hendrik, 2026-10-12): both**, one app with each region at its own address. Details and sources in plan/regions.md.

- **Addresses:** each region has its own address, `…/berlin/` and `…/oldenburg/`, with its own manifest, name and icon, so each installs as its own app on the phone. A region switch in the menu moves between them. The root address forwards to `/berlin/` with the same parameters, so old links keep working.
- **One codebase, one deploy:** the build writes one data folder per region; each address loads only its own data, so the first map stays as fast as now.
- **Timetables:** the Connect GTFS feed (Niedersachsen + Bremen). Its licence and download access still need checking before the build relies on it. Walking paths from the Geofabrik Niedersachsen and Bremen extracts, cut to the region's box.
- **Area:** Oldenburg plus about 40 km around it, including Bremen. It can grow later.
- **Name:** to be settled. The older plan said "Oldenburg in Minuten", which predates the rename to "Wohin jetzt?" (PR #134).
- **Berlin-only extras:** Oldenburg starts without live status and without Ring, Bezirke and landmarks. Water, parks and streets work anywhere. Oldenburg landmarks and VBN real-time can follow as their own items.
- **Stored on the phone:** favourites and recent places are kept per region, so switching doesn't mix them.
- **Builds:** each region has its own nightly build and release tag, run at different times so the release rate-limit problem doesn't return.

**Split (Hendrik, 2026-10-12: prep only).** The work is built in two parts:

1. **Region-ready code (prep), Done** (PR #126): Berlin is one entry in `packages/routing/src/regions.ts`, read by the app, the timetable build and the workflows; data is served from `data/berlin/`; favourites and recent places are stored per region and existing lists moved over. Nothing visible changed and the first map is as fast as before. Planned as: a region config holding everything that is Berlin-specific today (area box, map start point, names, timetable and walking-path sources, Berlin-only extras such as Ring, Bezirke, landmarks and live status), data loaded from a folder per region, and favourites and recent places stored per region, with existing Berlin favourites kept. Berlin stays the only region and keeps its current address; nothing visible changes and the first map is no slower.
2. **Region addresses and Oldenburg, held:** the `/berlin/` and `/oldenburg/` addresses, the forward from the root address, the region switch, and the Oldenburg data and build. Not started until the domain and the timetable feed account are settled (the app name is settled: "Wohin jetzt?").

Notes: measure against the snappiness rule and the CI speed budget. The prep is medium effort; part 2 is large and may itself be split (addresses, then Oldenburg data, then the region switch).

## 14. Android app

### Beta readiness

Hendrik, 2026-10-12: make the app ready for beta testing. **Blocked:** not started until Hendrik has explicitly agreed to the full approach, meaning a package and an address below. Once he has, the agreed items are queued in Up next. Source: plan/beta-readiness.md (project files), written when the app was live through PR #103; the notes below say what has shipped since.

Beta means friends install the web app from the browser on Android (Chrome) and iPhone (Safari). Effort: S = an afternoon, M = a day or two.

1. **Name under the icon** (S): already done. The installed app is called "Wohin jetzt?" since the rename (PR #134).
2. **Address** (decision): stay on github.io for the beta, or move to an own domain first. Moving later resets testers' favourites and needs a reinstall, so decide before inviting people.
3. **Feedback button and version** (S): "Feedback geben" in the menu opens a prefilled mail or form with the app version, timetable date, phone and browser, and the current map link. The version is shown in "Über diese Karte".
4. **Update hint** (S): when a new version is ready, a small "Neue Version – tippen zum Laden" note, so all testers run the same build.
5. **Tester guide** (S): one short German page on installing on Android and iPhone, five things to try (set start, tap a place, change time, meeting point, favourites) and how to report. Linked from the invite.
6. **Smoke test before deploy** (S): a phone-size browser test in CI, so a broken merge never reaches testers. Largely covered by B9 (group 15), which is already queued.
7. **Basemap offline** (S–M): already done. The service worker caches the basemap since B3 (PR #169).
8. **Real-phone speed check** (S): time the first map, moving the start and a tap on a cheap Android and an older iPhone (or 4× CPU throttle), and record it as the beta baseline.
9. **Privacy and licence note** (S): short German and English page on what goes to Photon and OpenFreeMap, that nothing is tracked and favourites stay on the phone, plus OSM/ODbL and VBB credits.
10. **Crash notes without tracking** (S): keep the last few errors on the phone and attach them to the feedback mail. No analytics service.

Packages:

- **A. Minimal:** 1, 3, 5.
- **B. Recommended:** 1, 3, 4, 5, 6, 7, 8, 9.
- **C. Everything:** B plus 10.

Recommendation (not Hendrik's decision yet): package B, and the address stays on github.io for the beta. Suggested order: 3, 4, 6, 9, 8, then 5 last so its screenshots match. Hendrik answers with a package and an address, such as "B1", or single items by number.

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

## 15. Third suggestions list

Items keep their ids from plan/suggestions-3.md (A1, B1 …), where each is described in detail. They are added here as Hendrik picks them.

- **Bug bundle (A1)**: Done (PR #151): all ten fixed.
- **Walking network: visible loading, no blocked taps (B1)**: Done (PR #155): the walking network loads after the first map.
- **Lean deploy: only the files the app uses (B2)**: Done (PR #156): timetables are .bin only, and each deploy copies only the files the app loads (streets.json added to the list for search).

- **Tap card: larger buttons, shorter meeting card (C2)**: Done (PR #174, as part of the redesign): all buttons at least 44 px, meeting trips folded behind "N weitere Fahrten".
- **"Bis N Min." view (D1)**: Done (PR #189): a switch in Ebenen with chips 15/30/45/60 Min., off by default, kept in the link as `bis=N`; everything within N minutes shaded in one green with no new routing (5–50 ms); meeting points use the slowest trip, comparison maps ignore it; taps 0.25–0.6 s live.
- **Faster first load and no stale work (B4 + B5)**: Done (PR #193): the start page starts the routing worker with the link and stored settings and preloads main.js, the map style and the tile connection; the worker drops superseded map and trip requests, and returning to the app recomputes only on a new minute or after 60 s hidden. Live, cold at 6 Mbit/150 ms: first map 1.73 s (was ~1.99 s), worker start 0.25 s (was 0.57 s).

### Lighter work per tap (B6)

Picked by Hendrik on 2026-10-12 ("Yes, all three", one PR each for B6–B8). With Typisch or Bestfall, each tap currently rasterises the whole grid. Compute only a window of 3–4 km around the tap, reuse scratch buffers for softening and painting instead of allocating about 3×6.5 MB per map, and fold the meeting-point offset into the colour table instead of copying the grid. From the code review (plan/reviews/code-runtime.md), also P4 (Typisch builds one grid instead of two: 297–633 → 127–166 ms in Node), P5 (faster walkFrom, about −25 % walk pass), P6 (simpler outlines) and P7 (row-wise blur).

### Background downloads after the basemap, no timetable fetch without a start (P1 + P2)

From the code review (plan/reviews/code-runtime.md, "build first"), a follow-up to B4 (PR #193). **P2:** opening without `from=` no longer fetches the hour's timetable (275 KB) next to main.js; only a link with a start preloads it, and the tile index is preloaded alongside the style (first frame about 1 s sooner on slow links). **P1:** walk.bin, lines.bin and the next-hour preload start once the map is idle, not at the first result (tiles about 1 s and labels about 1.3 s sooner on a throttled link). The builder checks both against what PR #193 already changed.

### Smaller Wohnlage-Karte memory (B7)

The Wohnlage-Karte keeps a full-precision grid per favourite for the last two maps. Keep one map and store minutes compactly (16-bit tenths of a minute, or only cells that are reached). From the code review, also P9 (about −30 MB worker memory).

### Typical timetable when offline (B8)

When a timetable fails to download (network error or offline), fall back to the typical window if one exists and show the existing "typical day" note instead of failing. From the code review, also P3: data files get hashed URLs and are served cache-first, so a deploy no longer makes the next start re-download about 3 MB.

### Notice, search and favourites polish (C5–C8)

Picked by Hendrik on 2026-10-12 ("Yes, all four"), one PR.

- **C5:** show a "N Linien anders" chip whenever the chosen day has changes within the visible map, with the list on tap, not only after a trip on an affected line.
- **C6:** the search box gets a title and placeholder for its purpose, such as "Lieblingsort hinzufügen" or "2. Startpunkt wählen", at every entry point.
- **C7:** a ☆ set on a map point is named by street and house number rather than a nearby place, and names can be edited in the favourites list.
- **C8:** stops rank above other places in the suggestions ("Potsdam Hbf" currently offers an old signal box first), and after picking a result the map fits the 45-minute ring instead of zooming in close.

### Broader CI checks and a sturdier timetable build (B9 + B10)

Picked by Hendrik on 2026-10-12 ("Yes, both"). CI and workflows only; the app itself does not change.

- **B9:** the CI speed check also times softening, outlines and painting per start, and the cell snapping separately. One browser smoke test against a small fixture opens the app, taps, and checks that minutes and outlines appear. The duplicate test and build in the deploy workflow on pull requests goes away. From the code review, also P10: the routing benchmarks and slow tests read the .bin files (they still fetch timetable-day.json, gone since B2), with one shared `cellAt` and `readWithProgress` helper.
- **B10:** the timetable build fails above a hard size ceiling (about 1.5 times the budget) and only warns below it. It also runs on a schedule of its own, so a failed timetable download no longer stops it; dated files roll forward from the last good feed.

### Default view readability: two variants to compare (C9)

Picked by Hendrik on 2026-10-12 ("Try both"). Two variants are built behind link parameters, and the default doesn't change yet:

- **(a) Stronger rings:** the 15/30/45-minute rings are thicker and labelled, transit lines stay thin until a place is tapped, and colours are off.
- **(b) Faint colours:** the heatmap is on by default at about 40 % opacity, with the rings as today.

The builder posts both links with the same start point so Hendrik can compare them on his phone. He then picks one on a decision card; the pick becomes the default and the other parameter goes. In the same step, from C10: a larger thumb on the heatmap slider (16 px today), and 55–60 % opacity when colours are switched on by hand.

### Named starts in meeting mode (D2)

Picked by Hendrik on 2026-10-12 ("Yes"). In meeting mode each start can carry an optional name (default "1. Start", "2. Start"). The name and its colour match on the map marker, in the trip card and in the suggested meeting places, and names travel in the link. "Teilen" prefills the message with the three suggested places and each person's minutes. Nothing changes for a single start.

### Code health, no change in behaviour (E1)

Picked by Hendrik on 2026-10-12 ("Yes"), the last item of the third suggestions list. One or two PRs, nothing visible changes:

- The READMEs describe today's app (no day/night windows, no JSON timetable examples, no "comes next" notes), the routing types are tidied and a stale comment goes.
- One shared helper cleans stop names per region, replacing three separate copies.
- The two largest files are split into smaller modules (pure moves): the app's main file into search, favourites and special maps, and the worker into timetables, painting, trips, home and living maps.
- The region script runs with plain Node, covered by a test.
- The worker keeps 4–5 timetables loaded instead of 3, so the current and next hour, a comparison and a step-free toggle don't push each other out.

Slotted in whenever no feature step is waiting.

### Smaller walking network file (P8)

From the code review (plan/reviews/code-runtime.md): a format change for walk.bin, about −0.65 MB. Placed last, after E1.

## 16. App stores and showcase

Added by Hendrik on 2026-10-12 as two roadmap steps, after the threads on existing travel-time maps and the "why not Google Maps" sharepic were closed. Both are not started and wait until Hendrik picks them.

- **Android and iOS app store deployment**: publish the app in Google Play and the Apple App Store. For Android, the options and ways to ship in group 14 apply (TWA first, then Capacitor if needed). For iOS, a wrapper such as Capacitor would be needed. Apple requires a paid developer account (99 USD a year) and app review. Group 14's "postponed" note still stands until Hendrik starts this step.
- **Showcase material**: material that presents the app, such as screenshots, the sharepics (see the sharepic notes in project memory) and a comparison with existing travel-time maps. Scope is set when Hendrik picks the step.

## 17. Review track

Hendrik, 2026-10-12: four reviews, handled by a new "Review negotiator" thread (agrees each step with the roadmap) and a "Review builder" thread, separate from the main builder queue. Status: reviews done (U1–U14, V1–V13, P1–P10, K1–K26), findings in plan/reviews/ (project files, README.md is the index). The code findings are folded into the main queue (P1+P2 as a B4 follow-up; P3 into B8, P4–P7 into B6, P9 into B7, P10 into B9, P8 last). The UI, looks and docs picks are pending with Hendrik.

- **UI intuitiveness**: check where the interface is intuitive and where it is not, and what could be handled more smartly or more obviously.
- **Visual consistency**: check map elements, colours, layout, symbols and text for consistency.
- **Code and runtime optimisations**: look for code and runtime improvements (the snappiness rule applies).
- **Docs and chats cleanup**: check documents and chats, archive resolved issues and implemented features, and remove redundancies. Goal: a smaller context window.
