import { describe, expect, it } from 'vitest';
import {
  cellAt,
  cellColRow,
  gridLayout,
  gridValueAt,
  heatGrid,
  journeyTo,
  loadTimetable,
  decodeWalkBin,
  encodeWalkBin,
  loadWalkNetwork,
  loadWalkNetworkInSteps,
  NETWORK_WALK_SPEED_MPS,
  nodeLonLat,
  snapCells,
  snapCellsInSteps,
  snapNear,
  snapPoint,
  travelTimes,
  walkFrom,
  walkFront,
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

describe('unpacking in steps', () => {
  it('pauses often and gives the same network', () => {
    // A 200 x 200 street grid: 40 000 nodes, 79 600 edges, more than a step's worth.
    const side = 200;
    const lat: number[] = [];
    const lon: number[] = [];
    for (let r = 0; r < side; r++)
      for (let c = 0; c < side; c++) {
        lat.push(52.5 + r * 0.0005);
        lon.push(13.4 + c * 0.0008);
      }
    const edgeA: number[] = [];
    const edgeB: number[] = [];
    const edgeM: number[] = [];
    for (let v = 0; v < side * side; v++) {
      for (const [b, m] of [
        [v % side < side - 1 ? v + 1 : -1, 55],
        [v + side < side * side ? v + side : -1, 56],
      ]) {
        if (b < 0) continue;
        edgeA.push(v);
        edgeB.push(b!);
        edgeM.push(m!);
      }
    }
    const bin = encodeWalkBin({ lat, lon, edgeA, edgeB, edgeM });
    const steps = loadWalkNetworkInSteps(bin);
    let pauses = 0;
    let s = steps.next();
    for (; !s.done; s = steps.next()) pauses++;
    expect(pauses).toBeGreaterThan(10);
    expect(s.value).toEqual(loadWalkNetwork(bin));
  });
});

describe('walk.bin version 2', () => {
  it('reads back the same network as version 1', () => {
    const sorted = edges
      .map(([a, b, m]) => (a < b ? [a, b, m] : [b, a, m]))
      .sort((p, q) => p[0] - q[0]);
    const v1 = decodeWalkBin(encode(nodes, edges));
    const bin = encodeWalkBin({
      lat: nodes.map(([, lat]) => lat),
      lon: nodes.map(([lon]) => lon),
      edgeA: sorted.map((e) => e[0]),
      edgeB: sorted.map((e) => e[1]),
      edgeM: sorted.map((e) => e[2]),
    });
    expect(bin[4]).toBe(2);
    expect(decodeWalkBin(bin)).toEqual(v1);
    const again = loadWalkNetwork(bin);
    expect(again.edgeMetres).toEqual(net.edgeMetres);
    expect(again.x).toEqual(net.x);
  });

  it('keeps detours and crooked edges exact', () => {
    // Edges far longer and a little shorter (rounding) than the straight line.
    const lat = [52.5, 52.50001, 52.51234, 52.4];
    const lon = [13.4, 13.40002, 13.45678, 13.3];
    const g = {
      lat,
      lon,
      edgeA: [0, 0, 1, 2],
      edgeB: [1, 3, 2, 3],
      edgeM: [1, 20000, 5000, 1],
    };
    const back = decodeWalkBin(encodeWalkBin(g));
    expect([...back.edgeM]).toEqual([1, 20000, 5000, 1]);
    expect([...back.lat]).toEqual(lat);
  });
});

// S041: one street, 100 m between nodes. A stop far down it is reached early (node 0 at 0 s),
// a nearer one late (node 5 at 600 s): the early one's walks pass node 5 first, but end at
// its cap, and the places behind must still get the later stop's walk.
describe('a nearer stop reached later', () => {
  const LAT = 52.5;
  const lonStep = 100 / (111320 * Math.cos((LAT * Math.PI) / 180));
  const line = loadWalkNetwork(
    encode(
      Array.from({ length: 31 }, (_, i): [number, number] => [LON0 + i * lonStep, LAT]),
      Array.from({ length: 30 }, (_, i): [number, number, number] => [i, i + 1, 100]),
    ),
  );
  const labelsAt = (f: ReturnType<typeof walkFront>, v: number) => {
    const out: [number, number, number][] = [];
    if (f.time[v] < Infinity) out.push([f.time[v], f.walk[v], f.source[v]]);
    for (let l = f.more[v]; l !== -1; l = f.xnext[l])
      out.push([f.xtime[l], f.xwalk[l], f.xsource[l]]);
    return out.map(([t, w, s]) => [Math.round(t), Math.round(w), s]);
  };

  it('is not blocked by a farther stop reached earlier', () => {
    // The old walk: the early stop takes every node and stops at its 1500 m cap.
    const one = walkFrom(line, [0, 5], [0, 600], [0, 0], [1, 2], 1500, 1);
    expect(one.time[15]).toBe(1500);
    expect(one.time[16]).toBe(Infinity);
    const f = walkFront(line, [0, 5], [0, 600], [0, 0], [1, 2], 1500, 1);
    // Both walks at node 10: the early one first, the later one with less walking.
    expect(labelsAt(f, 10)).toEqual([
      [1000, 1000, 1],
      [1100, 500, 2],
    ]);
    expect(labelsAt(f, 16)).toEqual([[1700, 1100, 2]]);
    // The cap still holds for the later stop: 1500 m from node 5 ends at node 20.
    expect(labelsAt(f, 20)).toEqual([[2100, 1500, 2]]);
    expect(labelsAt(f, 21)).toEqual([]);
  });

  it('drops a walk that is no earlier and no shorter', () => {
    const f = walkFront(line, [0, 5], [0, 400], [0, 0], [1, 2], 1500, 1);
    // From node 5 on the later stop is earlier too (400 s < 500 s) and walks less: one
    // label per node. Before it, both count: the far stop is earlier, the near one closer.
    expect(labelsAt(f, 10)).toEqual([[900, 500, 2]]);
    expect(labelsAt(f, 3)).toEqual([
      [300, 300, 1],
      [600, 200, 2],
    ]);
  });

  const lineStops: Timetable = {
    ...timetable,
    stops: [
      { id: 'far', name: 'Far', lat: LAT, lon: LON0 },
      { id: 'near', name: 'Near', lat: LAT, lon: LON0 + 5 * lonStep },
    ],
  };
  const ltt = loadTimetable(lineStops);
  const at = (secs: [number, number], opts: object) =>
    heatGrid(ltt, { stopSeconds: Float32Array.from(secs) } as Parameters<typeof heatGrid>[1], {
      walk: line,
      walkSpeedMps: 1,
      cellSizeM: 50,
      bbox: GRID_BBOX,
      ...opts,
    });

  it('gives the map the later stop where the earlier one walks too far', () => {
    const g = at([0, 600], { maxFinalWalkSeconds: 1500, maxFallbackWalkSeconds: 1500 });
    // Node 16 (1.6 km from the far stop, 1.1 km from the near one): 1700 s, give or take
    // the cell centre's 25 m.
    expect(Math.abs(gridValueAt(g, LAT, LON0 + 16 * lonStep) - 1700)).toBeLessThan(40);
    expect(gridValueAt(g, LAT, LON0 + 22 * lonStep)).toBe(Infinity);
  });

  it('prefers a walk within maxFinalWalk over an earlier longer one', () => {
    // At node 13 the far stop's walk (1300 m, 1300 s) is over 1200 m but within the
    // 1600 m fallback; the near stop's (800 m, 1400 s) is within 1200 m, so it wins.
    const g = at([0, 600], { maxFinalWalkSeconds: 1200, maxFallbackWalkSeconds: 1600 });
    expect(Math.abs(gridValueAt(g, LAT, LON0 + 13 * lonStep) - 1400)).toBeLessThan(40);
    // A window of cells gives the same, from the stops within reach of it.
    const [c, r] = cellColRow(
      gridLayout({ cellSizeM: 50, bbox: GRID_BBOX }),
      LAT,
      LON0 + 13 * lonStep,
    );
    const w = at([0, 600], {
      maxFinalWalkSeconds: 1200,
      maxFallbackWalkSeconds: 1600,
      window: { c0: c, r0: r, cols: 1, rows: 1 },
    });
    expect(w.seconds[0]).toBeCloseTo(gridValueAt(g, LAT, LON0 + 13 * lonStep), 3);
  });

  it('lets the origin ride all the way where it is quicker than a later stop', () => {
    // Cycling from node 0 (maxOriginSeconds 2000 s at 1 m/s): node 18 at 1800 s, a ride
    // over maxFinalWalk (300 s) but within the origin's reach. A stop at node 16 reached at
    // 1700 s gets there at 1900 s within 300 s: the quicker ride all the way still wins.
    const one = loadTimetable({
      ...timetable,
      stops: [{ id: 'mid', name: 'Mid', lat: LAT, lon: LON0 + 16 * lonStep }],
    });
    const g = heatGrid(
      one,
      {
        stopSeconds: Float32Array.from([1700]),
        origin: { lat: LAT, lon: LON0 },
      } as Parameters<typeof heatGrid>[1],
      {
        walk: line,
        walkSpeedMps: 1,
        cellSizeM: 50,
        bbox: GRID_BBOX,
        maxFinalWalkSeconds: 300,
        maxFallbackWalkSeconds: 600,
        maxOriginSeconds: 2000,
        trackStops: true,
      },
    );
    const k = cellAt(g, LAT, LON0 + 18 * lonStep);
    expect(Math.abs(g.seconds[k] - 1800)).toBeLessThan(40);
    expect(g.stop![k]).toBe(-1);
  });
});

describe('a place next to a cut-off path (S054)', () => {
  // A street (nodes 0–10, 100 m apart) and, 25 m north of it, a footway from x = 5 to x = 8
  // (nodes 11–14) that reaches the street only at its east end (node 14 to node 8).
  const Y = 52.5;
  const NORTH = 25 / 111320;
  const nodes: [number, number][] = [];
  const edges: [number, number, number][] = [];
  for (let i = 0; i <= 10; i++) nodes.push([LON0 + i * STEP, Y]);
  for (let i = 5; i <= 8; i++) nodes.push([LON0 + i * STEP, Y + NORTH]);
  for (let i = 0; i < 10; i++) edges.push([i, i + 1, 100]);
  for (let i = 11; i < 14; i++) edges.push([i, i + 1, 100]);
  edges.push([14, 8, 25]);
  const cut = loadWalkNetwork(encode(nodes, edges));
  // 3 m south of the footway, 22 m north of the street.
  const place = { lat: Y + NORTH - 3 / 111320, lon: LON0 + 5.2 * STEP };
  const stopTt = loadTimetable({
    ...timetable,
    stops: [{ id: 'x', name: 'Street', lat: Y, lon: LON0 + 5.2 * STEP }],
  });

  it('snaps to the footway first and to the street as well', () => {
    const s = snapNear(cut, place.lat, place.lon);
    expect(cut.edgeA[s.edge[0]]).toBe(11);
    expect(s.metres[0]).toBeLessThan(4); // walk.bin keeps 1e-5 degrees, about a metre
    expect(cut.edgeA[s.edge[1]]).toBe(5);
    expect(Math.abs(s.metres[1] - 22)).toBeLessThan(1.5);
    expect(s.edge.length).toBe(2);
    // With room for more: edges touching the footway's or the street's are the same path going on.
    expect(snapNear(cut, place.lat, place.lon, 300, 30, 4).edge[2]).toBe(-1);
    // Further than the spread from the nearest: not taken.
    expect(snapNear(cut, place.lat, place.lon, 300, 10).edge[1]).toBe(-1);
  });

  it('walks to the stop by the street, not round the footway', () => {
    const r = travelTimes(stopTt, place, { walk: cut, maxRounds: 0 });
    // 22 m onto the street, along it to the stop: well under a minute (round the footway ~590 m).
    expect(r.stopSeconds[0]).toBeLessThan(30);
  });

  it("gives the map's cells the walk by the street too", () => {
    // A map from the street's west end: a cell centred on the place gets there by the
    // street, not round by the footway's east end.
    const start = { lat: Y, lon: LON0 };
    // 50 m cells as in the app, one of them centred on the place.
    const dLat = 50 / 111320;
    const dLon = 50 / cut.mPerLon;
    const west = place.lon - 5.5 * dLon;
    const north = place.lat + 2.5 * dLat;
    const bbox: [number, number, number, number] = [
      west,
      north - 6 * dLat,
      west + 20 * dLon,
      north,
    ];
    const g = heatGrid(stopTt, travelTimes(stopTt, start, { walk: cut, maxRounds: 0 }), {
      cellSizeM: 50,
      bbox,
      walk: cut,
    });
    const v = gridValueAt(g, place.lat, place.lon);
    // About 520 m along the street and 22 m off it at 4 km/h: under 9 minutes; round the
    // footway (800 m along the street and 25 m up, 280 m back) about 16.
    expect(v).toBeLessThan(9 * 60);
  });

  it('draws the walk by the street', () => {
    const to = { lat: Y - 0.0001, lon: LON0 + 2 * STEP };
    const path = walkPath(cut, place, to)!;
    let m = 0;
    for (let i = 1; i < path.length; i++)
      m += Math.hypot(
        (path[i][0] - path[i - 1][0]) * cut.mPerLon,
        (path[i][1] - path[i - 1][1]) * 111320,
      );
    // 22 m to the street, about 320 m west along it, 11 m off it.
    expect(m).toBeLessThan(400);
    expect(path[0]).toEqual([place.lon, place.lat]);
    expect(path[path.length - 1]).toEqual([to.lon, to.lat]);
  });
});
