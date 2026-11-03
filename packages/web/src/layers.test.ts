import { describe, expect, it } from 'vitest';
import { loadTimetable, type Timetable } from '@berlin-transit-heatmap/routing';
import { desertThresholds } from './when';
import { accessGrid, departuresPerHour, desertLevel, stations, stopPoints } from './layers';
import { stationName } from './stop-name';

// Two platforms of one station (A1, A2 under parent A) and a stop B 1 km east.
const tt = loadTimetable({
  version: 1,
  window: 'day',
  serviceDate: '2026-10-13',
  windowStart: 36000,
  windowEnd: 43200,
  feedVersion: 'test',
  stops: [
    { id: 'A', name: 'S Testplatz (Berlin)', lat: 52.5, lon: 13.4 },
    { id: 'A1', name: 'S Testplatz (Berlin)', lat: 52.5, lon: 13.4, parent: 0 },
    { id: 'A2', name: 'S Testplatz (Berlin)', lat: 52.5001, lon: 13.4001, parent: 0 },
    { id: 'B', name: 'Berlin, Feldweg [Bus]', lat: 52.5, lon: 13.4147 },
  ],
  routes: [
    {
      name: 'S9',
      mode: 'sbahn',
      stops: [1, 3],
      // Every 10 minutes from 9:50 to 12:10: 12 of them leave inside 10:00-12:00.
      trips: Array.from({ length: 15 }, (_, i) => [35400 + i * 600, 35400 + i * 600 + 120]),
    },
    {
      name: 'S9',
      mode: 'sbahn',
      stops: [3, 2],
      trips: Array.from({ length: 12 }, (_, i) => [36000 + i * 600, 36000 + i * 600 + 120]),
    },
  ],
  transfers: [],
} satisfies Timetable);

describe('departuresPerHour', () => {
  it('counts departures inside the window, not arrivals at the last stop', () => {
    const ph = departuresPerHour(tt);
    expect(Array.from(ph)).toEqual([0, 6, 0, 6]);
  });
});

describe('stations', () => {
  it('merges platforms of one station and tidies names', () => {
    const fc = stations(tt, departuresPerHour(tt));
    const byName = Object.fromEntries(fc.features.map((f) => [f.properties.name, f.properties]));
    expect(byName['S Testplatz']).toEqual({ name: 'S Testplatz', perHour: 6, lines: 'S9' });
    expect(byName['Feldweg']).toEqual({ name: 'Feldweg', perHour: 6, lines: 'S9' });
  });

  it('cleans up stop names', () => {
    expect(stationName('S+U Alexanderplatz Bhf (Berlin)')).toBe('S+U Alexanderplatz Bhf');
    expect(stationName('Berlin, Roederplatz [Möllendorffstr. M8,18]')).toBe('Roederplatz');
  });
});

describe('stopPoints', () => {
  // An S+U station (S and U platforms without a parent, 60 m apart), a tram stop of the same
  // name 1 km away, a bus stop only ever arrived at, and a station served by no line.
  const hour = Array.from({ length: 3 }, (_, i) => [36000 + i * 1200, 36000 + i * 1200 + 120]);
  const net = loadTimetable({
    version: 1,
    window: 'day',
    serviceDate: '2026-10-13',
    windowStart: 36000,
    windowEnd: 39600,
    feedVersion: 'test',
    stops: [
      { id: 'S', name: 'S+U Kreuzung (Berlin) [S-Bahn]', lat: 52.5, lon: 13.4 },
      { id: 'U', name: 'S+U Kreuzung (Berlin) [U5]', lat: 52.5005, lon: 13.4003 },
      { id: 'T', name: 'S+U Kreuzung (Berlin) [Tram]', lat: 52.509, lon: 13.4 },
      { id: 'B', name: 'Berlin, Endstelle [Bus]', lat: 52.49, lon: 13.42 },
      { id: 'X', name: 'Berlin, Stillgelegt', lat: 52.48, lon: 13.43 },
    ],
    routes: [
      { name: 'U5', mode: 'ubahn', stops: [1, 0], trips: hour },
      { name: 'S3', mode: 'sbahn', stops: [0, 1], trips: hour },
      { name: 'M4', mode: 'tram', stops: [2, 0], trips: hour },
      { name: '100', mode: 'bus', stops: [2, 3], trips: hour },
    ],
    transfers: [],
  } satisfies Timetable);
  const fc = stopPoints(net);
  const props = fc.features.map((f) => f.properties);

  it('merges platforms of one name close together, keeps far ones apart, skips unserved stops', () => {
    expect(props).toHaveLength(3);
    expect(props.filter((p) => p.name === 'S+U Kreuzung')).toHaveLength(2);
    const sU = fc.features.find(
      (f) => f.properties.name === 'S+U Kreuzung' && f.properties.k === 0,
    )!;
    expect(sU.geometry.coordinates).toEqual([13.40015, 52.50025]);
  });

  it('gives each station its strongest mode, S before U, and counts end stops', () => {
    expect(props).toEqual([
      // Major stations last, so they draw on top.
      { name: 'Endstelle', k: 5 },
      { name: 'S+U Kreuzung', k: 3 },
      { name: 'S+U Kreuzung', k: 0 },
    ]);
  });
});

describe('access time', () => {
  it('is the walk to a stop plus half the gap between departures', () => {
    const g = accessGrid(tt, departuresPerHour(tt));
    // At the stop itself: 6 departures an hour -> a 10-minute gap -> 5 minutes' wait.
    const [w, s, e, n] = g.bbox;
    const c = Math.floor(((13.4 - w) / (e - w)) * g.cols);
    const r = Math.floor(((n - 52.5) / (n - s)) * g.rows);
    expect(g.seconds[r * g.cols + c]).toBeGreaterThanOrEqual(300);
    expect(g.seconds[r * g.cols + c]).toBeLessThan(300 + 120);
    // The far corner of Berlin has no stop within 15 minutes' walk.
    expect(g.seconds[0]).toBe(Infinity);
  });

  it('grades deserts by the chosen thresholds', () => {
    expect(desertLevel(540, desertThresholds({ day: 'weekday', hour: 10 }))).toBe(0);
    expect(desertLevel(700, desertThresholds({ day: 'weekday', hour: 10 }))).toBe(1);
    expect(desertLevel(1000, desertThresholds({ day: 'weekday', hour: 10 }))).toBe(2);
    expect(desertLevel(1000, desertThresholds({ day: 'weekday', hour: 2 }))).toBe(0);
    expect(desertLevel(Infinity, desertThresholds({ day: 'weekday', hour: 2 }))).toBe(2);
  });
});
