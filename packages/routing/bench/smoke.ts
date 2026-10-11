// Alpha smoke test: three origins in both windows, minutes to a few well-known places.
// Usage: pnpm --filter @berlin-transit-heatmap/routing smoke <dir with timetable-*.json>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gridValueAt, gridToGeoJSON, heatGrid, loadTimetable, travelTimes } from '../src/index';

const dir = process.argv[2] ?? '.data';
const ORIGINS = {
  Alexanderplatz: [52.5219, 13.4132],
  'Spandau Rathaus': [52.5355, 13.1996],
  Köpenick: [52.4585, 13.5815],
} as const;
const PLACES = {
  'Zoologischer Garten': [52.5069, 13.3326],
  Hauptbahnhof: [52.5251, 13.3694],
  Alexanderplatz: [52.5219, 13.4132],
  Hermannplatz: [52.4868, 13.4245],
  'BER Airport': [52.3644, 13.5108],
} as const;

for (const w of ['day', 'night'] as const) {
  const tt = loadTimetable(JSON.parse(readFileSync(join(dir, `timetable-${w}.json`), 'utf8')));
  console.log(`\n== ${w}`);
  for (const [name, [lat, lon]] of Object.entries(ORIGINS)) {
    const t0 = performance.now();
    const r = travelTimes(tt, { lat, lon });
    const g = heatGrid(tt, r);
    const fc = gridToGeoJSON(g);
    const ms = performance.now() - t0;
    let reach = 0;
    for (const s of g.seconds) if (Number.isFinite(s)) reach++;
    const mins = Object.entries(PLACES)
      .filter(([p]) => p !== name)
      .map(([p, [la, lo]]) => `${p} ${Math.round(gridValueAt(g, la, lo) / 60)}`)
      .join(', ');
    console.log(
      `${name}: ${ms.toFixed(0)} ms, ${reach}/${g.cols * g.rows} cells reachable, ${fc.features.length} features | ${mins}`,
    );
  }
}
