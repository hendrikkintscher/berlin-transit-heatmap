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
- `?from=lat,lon&w=night` in the URL restores a start point and window.
