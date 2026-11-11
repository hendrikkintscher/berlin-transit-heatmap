import { describe, expect, it } from 'vitest';
import { loadTimetable, type Timetable } from '@berlin-transit-heatmap/routing';
import { chainHops, hopsKey, networkHops, networkInSteps } from './worker-network';

/** Stops 0–5 in a row; an S-Bahn 0-1-2 both ways, a tram 2-3, a bus 3-4-5 and 4-1. */
function net(extraBus = false): Timetable {
  const stops = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `s${i}`,
    name: `S${i}`,
    lat: 52.5,
    lon: 13.4 + i * 0.01,
  }));
  const route = (name: string, mode: Timetable['routes'][number]['mode'], s: number[]) => ({
    name,
    mode,
    stops: s,
    trips: [s.map((_, i) => 36000 + 60 * i)],
  });
  const routes = [
    route('S1', 'sbahn', [0, 1, 2]),
    route('S1', 'sbahn', [2, 1, 0]),
    route('M1', 'tram', [2, 3]),
    route('100', 'bus', [3, 4, 5]),
    route('200', 'bus', [4, 1]),
  ];
  if (extraBus) routes.push(route('300', 'bus', [5, 0]));
  return {
    version: 1,
    window: 'day',
    serviceDate: '2026-11-11',
    windowStart: 36000,
    windowEnd: 39600,
    feedVersion: 't',
    stops,
    routes,
    transfers: [],
  };
}

const run = <T>(g: Generator<void, T>): T => {
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
};
const parse = (b: ArrayBuffer) =>
  JSON.parse(new TextDecoder().decode(b)) as GeoJSON.FeatureCollection<GeoJSON.LineString>;

describe('the network as faint lines (S058)', () => {
  it('takes every hop once per mode, both directions as one', () => {
    const tt = loadTimetable(net());
    const hops = networkHops(tt);
    const n = tt.stopCount;
    const pairs = (m: string) => [...hops.get(m as never)!].map((k) => [Math.floor(k / n), k % n]);
    expect(pairs('sbahn').sort()).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(pairs('tram')).toEqual([[2, 3]]);
    expect(pairs('bus').sort()).toEqual([
      [1, 4],
      [3, 4],
      [4, 5],
    ]);
  });

  it('chains hops into paths between ends and junctions, loops included', () => {
    const paths = chainHops([
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ]);
    expect(paths.map((p) => p.length).sort()).toEqual([2, 2, 3]);
    expect(paths.flatMap((p) => p.slice(1).map((s, i) => [p[i]!, s].sort().join())).sort()).toEqual(
      ['0,1', '1,2', '2,3', '2,4'],
    );
    expect(
      chainHops([
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    ).toHaveLength(1);
  });

  it('puts S-Bahn, U-Bahn and regional in rail, tram in tram and bus in bus, along the courses', () => {
    const tt = loadTimetable(net());
    const files = run(
      networkInSteps(tt, networkHops(tt), (stops) =>
        stops.map((s) => [tt.stopLon[s]! + 0.000001, tt.stopLat[s]!]),
      ),
    );
    const rail = parse(files.rail);
    expect(rail.features).toHaveLength(1);
    expect(rail.features[0]!.properties).toEqual({ mode: 'sbahn' });
    // Rounded to 1e-5 degrees (about a metre).
    expect(rail.features[0]!.geometry.coordinates.map((c) => c[0]).sort()).toEqual([
      13.4, 13.41, 13.42,
    ]);
    expect(parse(files.tram).features.map((f) => f.properties!.mode)).toEqual(['tram']);
    const bus = parse(files.bus);
    expect(bus.features.every((f) => f.properties!.mode === 'bus')).toBe(true);
    expect(bus.features.reduce((n, f) => n + f.geometry.coordinates.length - 1, 0)).toBe(3);
  });

  it('knows when another hour has other hops', () => {
    const a = hopsKey(networkHops(loadTimetable(net())));
    expect(hopsKey(networkHops(loadTimetable(net())))).toBe(a);
    expect(hopsKey(networkHops(loadTimetable(net(true))))).not.toBe(a);
  });
});
