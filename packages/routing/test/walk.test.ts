import { describe, expect, it } from 'vitest';
import {
  gridValueAt,
  heatGrid,
  journeyTo,
  loadTimetable,
  loadWalkNetwork,
  NETWORK_WALK_SPEED_MPS,
  snapCells,
  snapPoint,
  travelTimes,
  walkFrom,
  type Timetable,
} from '../src';

/** Encodes nodes [lon, lat] and edges [a, b, metres] as walk.bin (Contract 3). */
function encode(nodes: [number, number][], edges: [number, number, number][]): Uint8Array {
  const out: number[] = [0x42, 0x54, 0x48, 0x57, 1];
  const uvar = (v: number) => {
    while (v >= 0x80) {
      out.push((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    out.push(v);
  };
  const svar = (v: number) => uvar(v < 0 ? -2 * v - 1 : 2 * v);
  uvar(nodes.length);
  uvar(edges.length);
  let px = 0;
  let py = 0;
  for (const [lon, lat] of nodes) {
    const x = Math.round(lon * 1e5);
    const y = Math.round(lat * 1e5);
    svar(x - px);
    svar(y - py);
    px = x;
    py = y;
  }
  const sorted = edges
    .map(([a, b, m]) => (a < b ? [a, b, m] : [b, a, m]))
    .sort((p, q) => p[0] - q[0]);
  for (let a = 0; a < nodes.length; a++) {
    const mine = sorted.filter((e) => e[0] === a);
    uvar(mine.length);
    for (const [, b, m] of mine) {
      uvar(b - a);
      uvar(m);
    }
  }
  return Uint8Array.from(out);
}

// Two streets along a river, 200 m apart, with the only bridge 1 km east.
const LAT_N = 52.5009;
const LAT_S = 52.4991;
const LON0 = 13.4;
const STEP = 0.001466; // about 100 m of longitude
const nodes: [number, number][] = [];
const edges: [number, number, number][] = [];
for (let i = 0; i <= 20; i++) nodes.push([LON0 + i * STEP, LAT_N]);
for (let i = 0; i <= 20; i++) nodes.push([LON0 + i * STEP, LAT_S]);
for (let i = 0; i < 20; i++) {
  edges.push([i, i + 1, 100]);
  edges.push([21 + i, 22 + i, 100]);
}
edges.push([10, 31, 200]); // the bridge
const net = loadWalkNetwork(encode(nodes, edges));

const timetable: Timetable = {
  version: 1,
  window: 'day',
  serviceDate: '2026-10-13',
  windowStart: 36000,
  windowEnd: 43200,
  feedVersion: 'test',
  stops: [
    { id: 'n', name: 'North', lat: LAT_N, lon: LON0 + 2 * STEP },
    { id: 's', name: 'South', lat: LAT_S, lon: LON0 + 2 * STEP },
  ],
  routes: [],
  transfers: [],
};
const tt = loadTimetable(timetable);
const origin = { lat: LAT_N + 0.0002, lon: LON0 + 0.5 * STEP };

describe('walking network', () => {
  it('decodes nodes and edges', () => {
    expect(net.nodeCount).toBe(42);
    expect(net.edgeCount).toBe(41);
    expect(net.lat[0]).toBeCloseTo(LAT_N, 5);
    expect(net.lon[20]).toBeCloseTo(LON0 + 20 * STEP, 5);
    expect(net.edgeMetres[0]).toBe(100);
    expect(NETWORK_WALK_SPEED_MPS).toBeCloseTo(4 / 3.6, 6);
  });

  it('rejects other files', () => {
    expect(() => loadWalkNetwork(new Uint8Array([1, 2, 3, 4, 1]))).toThrow();
  });

  it('snaps a point to the nearest edge', () => {
    const snaps = {
      edge: new Int32Array(1),
      along: new Float32Array(1),
      metres: new Float32Array(1),
    };
    snapPoint(net, LAT_N + 0.0003, LON0 + 2.5 * STEP, snaps);
    expect(net.edgeA[snaps.edge[0]]).toBe(2);
    expect(net.edgeB[snaps.edge[0]]).toBe(3);
    expect(snaps.along[0]).toBeCloseTo(0.5, 1);
    expect(snaps.metres[0]).toBeCloseTo(33, 0);
    snapPoint(net, 52.6, 13.4, snaps);
    expect(snaps.edge[0]).toBe(-1);
  });

  it('runs a capped multi-source Dijkstra', () => {
    const l = walkFrom(net, [0, 20], [0, 50], [0, 0], [7, 8], 1200, 0.9);
    expect(l.time[5]).toBeCloseTo(450, 3);
    expect(l.source[5]).toBe(7);
    expect(l.source[19]).toBe(8);
    // Across the bridge: 1 km + 200 m from node 0, right at the 1200 m cap.
    expect(l.time[31]).toBeCloseTo(1080, 3);
    expect(l.time[32]).toBe(Infinity);
  });

  it('walks to stops on the network, around the river', () => {
    const straight = travelTimes(tt, origin);
    const walked = travelTimes(tt, origin, { walk: net });
    expect(straight.stopSeconds[1]).toBeLessThan(300);
    expect(walked.stopSeconds[0]).toBeGreaterThan(100);
    expect(walked.stopSeconds[0]).toBeLessThan(200);
    expect(walked.stopSeconds[1]).toBe(Infinity); // 2.3 km round the bridge
  });

  it('walks at 4 km/h unless told otherwise', () => {
    const at = (o: { walkSpeedMps?: number }) =>
      gridValueAt(
        heatGrid(tt, travelTimes(tt, origin, { walk: net, ...o }), {
          cellSizeM: 50,
          walk: net,
          ...o,
        }),
        LAT_N,
        LON0 + 6 * STEP,
      );
    const slow = at({});
    expect(slow).toBeGreaterThan(500 * 0.9);
    expect(slow).toBeLessThan(600 * 0.9);
    expect(at({ walkSpeedMps: 4.8 / 3.6 })).toBeCloseTo(slow * (4 / 4.8), 0);
  });

  it('colours the far bank by the walk over the bridge', () => {
    const o = { walk: net, walkSpeedMps: 4.8 / 3.6 };
    const r = travelTimes(tt, origin, o);
    const grid = heatGrid(tt, r, { cellSizeM: 50, trackStops: true, ...o });
    const north = gridValueAt(grid, LAT_N, LON0 + 6 * STEP);
    const south = gridValueAt(grid, LAT_S, LON0 + 10 * STEP);
    expect(north).toBeLessThan(900);
    expect(south).toBeGreaterThan(north);
    expect(south).toBeLessThan(900); // 950 m to the bridge and 200 m over it
    // 2 km round the bridge: past the 15-minute walk, so only the fallback walk gets there.
    const capped = heatGrid(tt, r, { cellSizeM: 50, maxFallbackWalkSeconds: 900, ...o });
    expect(gridValueAt(capped, LAT_S, LON0 + STEP)).toBe(Infinity);
    const far = gridValueAt(grid, LAT_S, LON0 + STEP);
    expect(far).toBeGreaterThan(1500);
    expect(far).toBeLessThan(1800);
    // Where a short walk exists, a longer one never replaces it.
    expect(gridValueAt(capped, LAT_S, LON0 + 10 * STEP)).toBe(south);
    // Straight lines cross the river.
    const flat = heatGrid(tt, travelTimes(tt, origin), { cellSizeM: 50 });
    expect(gridValueAt(flat, LAT_S, LON0 + STEP)).toBeLessThan(300);
    // The trip there is one walk, however it is split at the stop on the way.
    const j = journeyTo(
      tt,
      travelTimes(tt, origin, { ...o, trackLegs: true }),
      grid,
      LAT_S,
      LON0 + 10 * STEP,
    );
    expect(j?.legs).toHaveLength(1);
    expect(j?.legs[0]).toMatchObject({ type: 'walk', seconds: Math.round(south) });
  });

  it('snaps grid cells like single points', () => {
    const bbox: [number, number, number, number] = [13.398, 52.497, 13.43, 52.503];
    const cols = 40;
    const rows = 12;
    const cells = snapCells(net, bbox, cols, rows);
    const one = {
      edge: new Int32Array(1),
      along: new Float32Array(1),
      metres: new Float32Array(1),
    };
    for (let k = 0; k < cols * rows; k += 7) {
      const r = Math.floor(k / cols);
      const c = k % cols;
      snapPoint(
        net,
        bbox[3] - ((r + 0.5) * (bbox[3] - bbox[1])) / rows,
        bbox[0] + ((c + 0.5) * (bbox[2] - bbox[0])) / cols,
        one,
      );
      expect(cells.metres[k]).toBeCloseTo(one.metres[0], 1);
    }
  });
});
