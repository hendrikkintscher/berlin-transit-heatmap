import { describe, expect, it } from 'vitest';
import {
  gridValueAt,
  heatGrid,
  journeyTo,
  loadTimetable,
  loadWalkNetwork,
  NETWORK_WALK_SPEED_MPS,
  nodeLonLat,
  snapCells,
  snapCellsInSteps,
  snapPoint,
  travelTimes,
  walkFrom,
  walkPath,
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
/** The grid the expectations below were measured on, so they do not move with DEFAULT_BBOX. */
const GRID_BBOX: [number, number, number, number] = [13.08, 52.33, 13.77, 52.68];
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
    expect(nodeLonLat(net, 0)[1]).toBeCloseTo(LAT_N, 5);
    expect(nodeLonLat(net, 20)[0]).toBeCloseTo(LON0 + 20 * STEP, 5);
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
          bbox: GRID_BBOX,
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

  it('computes a window of cells the same as the whole grid there', () => {
    const o = { walk: net, walkSpeedMps: 4.8 / 3.6 };
    const r = travelTimes(tt, origin, o);
    const opts = { cellSizeM: 50, bbox: GRID_BBOX, trackStops: true, ...o };
    const full = heatGrid(tt, r, opts);
    const win = { c0: 3, r0: 2, cols: 5, rows: 4 };
    const part = heatGrid(tt, r, { ...opts, window: win });
    expect([part.cols, part.rows]).toEqual([5, 4]);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 5; x++) {
        const k = (win.r0 + y) * full.cols + win.c0 + x;
        expect(part.seconds[y * 5 + x]).toBe(full.seconds[k]);
        expect(part.stop![y * 5 + x]).toBe(full.stop![k]);
      }
    // Its bbox is its own cells', so lookups by place still hit the same cell.
    const [w, , , n] = part.bbox;
    const lat = n - 0.5 * ((n - part.bbox[1]) / 4);
    const lon = w + 0.5 * ((part.bbox[2] - w) / 5);
    expect(gridValueAt(part, lat, lon)).toBe(gridValueAt(full, lat, lon));
  });

  it('colours the far bank by the walk over the bridge', () => {
    const o = { walk: net, walkSpeedMps: 4.8 / 3.6 };
    const r = travelTimes(tt, origin, o);
    const grid = heatGrid(tt, r, { cellSizeM: 50, bbox: GRID_BBOX, trackStops: true, ...o });
    const north = gridValueAt(grid, LAT_N, LON0 + 6 * STEP);
    const south = gridValueAt(grid, LAT_S, LON0 + 10 * STEP);
    expect(north).toBeLessThan(900);
    expect(south).toBeGreaterThan(north);
    expect(south).toBeLessThan(900); // 950 m to the bridge and 200 m over it
    // 2 km round the bridge: past the 15-minute walk, so only the fallback walk gets there.
    const capped = heatGrid(tt, r, {
      cellSizeM: 50,
      bbox: GRID_BBOX,
      maxFallbackWalkSeconds: 900,
      ...o,
    });
    expect(gridValueAt(capped, LAT_S, LON0 + STEP)).toBe(Infinity);
    const far = gridValueAt(grid, LAT_S, LON0 + STEP);
    expect(far).toBeGreaterThan(1500);
    expect(far).toBeLessThan(1800);
    // Where a short walk exists, a longer one never replaces it.
    expect(gridValueAt(capped, LAT_S, LON0 + 10 * STEP)).toBe(south);
    // Straight lines cross the river.
    const flat = heatGrid(tt, travelTimes(tt, origin), { cellSizeM: 50, bbox: GRID_BBOX });
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

  it('adds the bike station time at both ends, not on the way straight there', () => {
    const o = { walk: net };
    const plain = travelTimes(tt, origin, o);
    const bike = travelTimes(tt, origin, { ...o, accessPenaltySeconds: 120 });
    expect(bike.stopSeconds[0]).toBe(plain.stopSeconds[0] + 120);
    // From the south stop only: every cell pays the time to get the bike out.
    const fromStop = { stopSeconds: Float32Array.of(Infinity, 0), computedInMs: 0 };
    const at = (egressPenaltySeconds: number) =>
      gridValueAt(
        heatGrid(tt, fromStop, { cellSizeM: 50, bbox: GRID_BBOX, egressPenaltySeconds, ...o }),
        LAT_S,
        LON0 + 3 * STEP,
      );
    expect(at(120)).toBeCloseTo(at(0) + 120, 3);
    // Straight from the origin there is no station to pass.
    const grid = heatGrid(tt, plain, {
      cellSizeM: 50,
      bbox: GRID_BBOX,
      egressPenaltySeconds: 120,
      ...o,
    });
    expect(gridValueAt(grid, LAT_N, LON0 + STEP)).toBeLessThan(120);
  });

  it('lets the way from the origin go further than from the stops', () => {
    // As with a bike: stops then never tie with the way straight from the origin.
    const o = { walk: net, maxFallbackWalkSeconds: 900, egressPenaltySeconds: 120 };
    const r = travelTimes(tt, origin, o);
    const capped = heatGrid(tt, r, { cellSizeM: 50, bbox: GRID_BBOX, ...o });
    expect(gridValueAt(capped, LAT_S, LON0 + STEP)).toBe(Infinity);
    const far = heatGrid(tt, r, { cellSizeM: 50, bbox: GRID_BBOX, maxOriginSeconds: 3600, ...o });
    expect(gridValueAt(far, LAT_S, LON0 + STEP)).toBeGreaterThan(1500);
    expect(gridValueAt(far, LAT_S, LON0 + STEP)).toBeLessThan(2400);
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
      // The way onto the edge, from the walks to its two ends.
      const e = cells.edge[k];
      const off = e < 0 ? Infinity : (cells.da[k] + cells.db[k] - net.edgeMetres[e]) / 2;
      expect(off).toBeCloseTo(one.metres[0], 1);
    }
  });
});

describe('walkPath', () => {
  const near = (p: [number, number], lon: number, lat: number) =>
    Math.abs(p[0] - lon) < 1e-6 && Math.abs(p[1] - lat) < 1e-6;

  it('goes round by the bridge across the river', () => {
    const from = { lat: LAT_N + 0.0002, lon: LON0 + 2.5 * STEP };
    const to = { lat: LAT_S - 0.0002, lon: LON0 + 2.5 * STEP };
    const path = walkPath(net, from, to)!;
    expect(path[0]).toEqual([from.lon, from.lat]);
    expect(path[path.length - 1]).toEqual([to.lon, to.lat]);
    const bridgeN = path.findIndex((p) => near(p, ...nodeLonLat(net, 10)));
    const bridgeS = path.findIndex((p) => near(p, ...nodeLonLat(net, 31)));
    expect(bridgeN).toBeGreaterThan(0);
    expect(bridgeS).toBe(bridgeN + 1);
    // Along the north street east to the bridge: nodes 3 to 10, then 31 back to 23.
    expect(path.length).toBe(2 + 8 + 8 + 2);
  });

  it('walks straight along one street', () => {
    const path = walkPath(
      net,
      { lat: LAT_N, lon: LON0 + 2.2 * STEP },
      { lat: LAT_N, lon: LON0 + 2.8 * STEP },
    )!;
    expect(path).toHaveLength(4);
  });

  it('gives up off the network', () => {
    expect(walkPath(net, { lat: 52.6, lon: 13.4 }, { lat: LAT_N, lon: LON0 })).toBeNull();
  });

  it('snaps grid cells in steps, with pauses, to the same result', () => {
    const bbox: [number, number, number, number] = [13.399, 52.497, 13.43, 52.503];
    const steps = snapCellsInSteps(net, bbox, 30, 10);
    let pauses = 0;
    let s = steps.next();
    for (; !s.done; s = steps.next()) pauses++;
    expect(pauses).toBeGreaterThan(0);
    // Cached: the one-go version hands back the same snaps.
    expect(snapCells(net, bbox, 30, 10)).toBe(s.value);
  });
});
