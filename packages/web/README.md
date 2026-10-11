# web

The Berlin Transit Heatmap app: Vite + TypeScript + MapLibre GL JS, installable as a PWA.

```sh
pnpm --dir packages/web dev       # http://localhost:5173
pnpm --dir packages/web test
pnpm --dir packages/web build     # -> packages/web/dist
```

- Timetables are fetched from `./data/timetable-{day,night}.json` (copied in by `deploy-pages.yml`
  from the `timetable-latest` release). For local testing, drop the release files into
  `packages/web/public/data/`.
- Routing runs in a Web Worker (`src/worker.ts`) using `@berlin-transit-heatmap/routing`.
- The worker computes a 50 m grid, then paints it into an RGBA image at 25 m pixels (travel
  times interpolated between cells before colouring, rows resampled to Web Mercator). For looks
  the image is softened (`src/soften.ts`): a light blur, a gentle noise wobble that breaks up the
  walking circles around stops, and feathered band edges. Tap minutes use the raw grid. The page
  shows it through a MapLibre canvas source, and reads tap minutes from the grid.
- Colour bands (`src/colors.ts`): 5 min up to 20, 2.5 min from 20 to 50, then 50–55, 55–60,
  60–75, 75–90, 90–120, 120+. Hues run green, yellow, red, purple, navy.
- The "Lines" overlay shows the transit hops the fastest trips rely on (`routeUsage`), line width
  by the share of the reachable map behind each hop, coloured by mode.
- `?from=lat,lon&w=night&routes=0&lang=en` in the URL restores a start point, window, the Lines
  toggle and the language.
- Interface text lives in `src/i18n.ts`, German by default with English. Static text in
  `index.html` names its string with `data-t`, `data-t-html`, `data-t-label` or
  `data-t-placeholder`. The menu (burger button) holds Lines, the language switch and About.
- Map layers (`src/layers.ts`, in the menu, `?layers=freq,desert`): stop frequency (departures per
  hour per station) and transit deserts (walk to a platform + half its gap between departures, on a
  100 m grid; thresholds in `DESERT_THRESHOLDS`). The worker computes both per window on first use.
- Address search (`src/search.ts`) only suggests places inside the heatmap area (`DEFAULT_BBOX`).
