# web

The app, "Wohin jetzt? · Öffis mit einem Tap": Vite + TypeScript + MapLibre GL JS,
installable as a PWA.

```sh
pnpm --dir packages/web dev       # http://localhost:5173
pnpm --dir packages/web test
pnpm --dir packages/web build     # -> packages/web/dist
```

- **Data.** The region's files come from `./data/<region>/` (copied in by `deploy-pages.yml` from
  the `timetable-latest` release): one binary timetable per hour (`timetable-weekday-HH.bin`,
  `timetable-weekend-HH.bin`, and `timetable-YYYYMMDD-HH.bin` for the coming week) with the
  stops and footpaths they share in `stoplist.bin` (loaded once, `worker-timetables.ts`), `walk.bin`
  (footpaths), `lines.bin` (the lines' courses), `streets.json` (search), `changes.json` and
  `stop-ids.json`. URLs carry a `?v=` hash from the deploy (`data-url.ts`), so the service
  worker (`sw.js`) can keep them. For local testing, drop the release files into
  `packages/web/public/data/berlin/`.
- **Start.** `boot.ts` starts the worker and, with a start in the link, its first timetable
  and the stop list before the app's code has loaded; then it loads `main.ts`.
- **Worker** (`worker.ts` and `worker-*.ts`): timetables, the routing pass per start on a 50 m
  grid, the colour image (`paint.ts`, `soften.ts`) and the time lines (`contours.ts`), trips on
  tap, and the home and where-to-live maps. The footpaths and the lines' courses load in the
  background once the first map is on screen.
- **App** (`main.ts`): the map, start markers and results. In their own modules: the search
  bar (`search-bar.ts`, `search.ts`, `search-local.ts`), favourite places (`fav-places.ts`,
  `favourites.ts`), the home and where-to-live maps (`special-maps.ts`), the time panel
  (`when-sheet.ts`, `when.ts`), the top chips (`chips.ts`), the menu (`menu.ts`), taps and the
  trip card (`tap.ts`, `trip-card.ts`), meeting points (`meet.ts`), today's changes
  (`changes.ts`) and live delays (`live.ts`).
- **Fresh start.** `fresh/index.html` with `src/fresh.ts` inline (`…/fresh/`): removes the
  app's service worker, its caches and stored settings, asking first whether to keep favourite
  places and recent searches, then opens the app (with the link's parameters) as on a new device.
- **Link.** `url.ts` reads and writes every link parameter (start, more starts, destination,
  time, measure, direction, comparison, travel mode, layers, language); its tests list them.
- **Text.** Interface text lives in `i18n.ts`, German by default with English. Static text in
  `index.html` names its string with `data-t`, `data-t-html`, `data-t-label` or
  `data-t-placeholder`.
- **Region.** Area, names and data sources come from `packages/routing/src/regions.ts`.
