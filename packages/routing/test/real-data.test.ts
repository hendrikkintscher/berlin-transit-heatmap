/**
 * Slow tests against the real VBB timetable from release `timetable-latest`.
 * Skipped unless ROUTING_SLOW=1 (`pnpm test:slow`); files are cached in .data/.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  gridToGeoJSON,
  heatGrid,
  loadTimetable,
  travelTimes,
  type PreparedTimetable,
} from '../src';
import { readTimetable } from '../bench/data';

const SLOW = process.env.ROUTING_SLOW === '1';

const ALEXANDERPLATZ = { lat: 52.52152, lon: 13.411226 };
const HAUPTBAHNHOF = { lat: 52.525147, lon: 13.369354 };

/** Best travel time in minutes to any stop whose name matches. */
function minutesTo(tt: PreparedTimetable, seconds: Float32Array, name: RegExp): number {
  let best = Infinity;
  let found = false;
  tt.stops.forEach((s, i) => {
    if (!name.test(s.name)) return;
    found = true;
    best = Math.min(best, seconds[i]);
  });
  if (!found) throw new Error(`No stop matches ${name}`);
  return best / 60;
}

const reached = (x: Float32Array) => x.filter((v) => v < Infinity).length;

describe.skipIf(!SLOW)('real VBB timetable', { timeout: 120_000 }, () => {
  let day: PreparedTimetable;
  let night: PreparedTimetable;

  beforeAll(async () => {
    day = loadTimetable(await readTimetable('day'));
    night = loadTimetable(await readTimetable('night'));
  }, 120_000);

  it('Alexanderplatz to Zoologischer Garten takes 10 to 20 minutes by day', () => {
    const r = travelTimes(day, ALEXANDERPLATZ);
    const m = minutesTo(day, r.stopSeconds, /^S\+U Zoologischer Garten/);
    console.log(
      `Alexanderplatz -> Zoologischer Garten: ${m.toFixed(1)} min (${r.computedInMs.toFixed(0)} ms)`,
    );
    expect(m).toBeGreaterThanOrEqual(10);
    expect(m).toBeLessThanOrEqual(20);
  });

  it('Hauptbahnhof to BER takes 18 to 40 minutes by day (FEX via Dresdner Bahn is about 23)', () => {
    const r = travelTimes(day, HAUPTBAHNHOF);
    const m = minutesTo(day, r.stopSeconds, /Flughafen BER/);
    console.log(`Hauptbahnhof -> BER: ${m.toFixed(1)} min`);
    expect(m).toBeGreaterThanOrEqual(18);
    expect(m).toBeLessThanOrEqual(40);
  });

  it('reaches almost all of Berlin by day and less at night', () => {
    const d = travelTimes(day, ALEXANDERPLATZ);
    const n = travelTimes(night, ALEXANDERPLATZ);
    expect(reached(d.stopSeconds) / day.stopCount).toBeGreaterThan(0.9);
    const dayZoo = minutesTo(day, d.stopSeconds, /^S\+U Zoologischer Garten/);
    const nightZoo = minutesTo(night, n.stopSeconds, /^S\+U Zoologischer Garten/);
    console.log(`Alexanderplatz -> Zoologischer Garten at night: ${nightZoo.toFixed(1)} min`);
    expect(nightZoo).toBeGreaterThanOrEqual(dayZoo);
    expect(nightZoo).toBeLessThan(60);
    // Day cells reachable within 30 min outnumber night ones.
    const within = (g: Float32Array, s: number) => g.filter((v) => v <= s).length;
    expect(within(heatGrid(night, n).seconds, 1800)).toBeLessThan(
      within(heatGrid(day, d).seconds, 1800),
    );
  });

  it('computes a full heatmap well within the time budget', () => {
    const t0 = performance.now();
    const r = travelTimes(day, ALEXANDERPLATZ);
    const fc = gridToGeoJSON(heatGrid(day, r));
    const ms = performance.now() - t0;
    console.log(`full day computation: ${ms.toFixed(0)} ms, ${fc.features.length} cells`);
    expect(fc.features.length).toBeGreaterThan(10_000);
    expect(ms).toBeLessThan(3000);
  });
});
