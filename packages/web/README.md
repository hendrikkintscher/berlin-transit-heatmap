# web

The Berlin Transit Heatmap app: Vite + TypeScript + MapLibre GL JS, installable as a PWA.

```sh
pnpm --dir packages/web dev       # http://localhost:5173
pnpm --dir packages/web test
pnpm --dir packages/web build     # -> packages/web/dist
```

- Timetables are fetched from `./data/timetable-{day,night}.json` (copied in by `deploy-pages.yml`
  from the `timetable-latest` release). Without them the app falls back to made-up demo data.
  For local testing with real data, drop the release files into `packages/web/public/data/`.
- Routing runs in a Web Worker (`src/worker.ts`) through `src/routing/index.ts`, the single
  switch point between the temporary stub and the `routing` package.
- `?from=lat,lon&w=night` in the URL restores a start point and window.
