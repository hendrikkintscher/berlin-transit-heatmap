import type { Timetable } from '../src';

/** About 1 km east-west at Berlin's latitude, in degrees of longitude. */
export const KM_LON = 1000 / (111_320 * Math.cos((52.52 * Math.PI) / 180));
/** About 1 km north-south, in degrees of latitude. */
export const KM_LAT = 1000 / 111_320;

const LAT = 52.52;
const LON = 13.4;
const H10 = 10 * 3600;

const at = (east: number, north = 0) => ({ lat: LAT + north * KM_LAT, lon: LON + east * KM_LON });

export const A = 0;
export const B = 1;
export const C = 2;
export const D = 3;
export const E = 4;
export const F = 5;
export const G = 6;
export const H = 7;
export const I = 8;

export const STOP_POS = [
  at(0),
  at(1),
  at(2),
  at(3),
  at(2, 1),
  at(2, 2),
  at(2.2, 0),
  at(2.2, 3),
  at(9, 9),
];

/** Trips every `headway` seconds from `first` (inclusive) to `last` (inclusive), `hop` seconds between stops. */
function trips(
  first: number,
  last: number,
  headway: number,
  stops: number,
  hop: number,
): number[][] {
  const out: number[][] = [];
  for (let t = first; t <= last; t += headway)
    out.push(Array.from({ length: stops }, (_, i) => t + i * hop));
  return out;
}

/**
 * A tiny hand-built network:
 *
 *   U1   A - B - C - D        every 10 min from 10:00, 2 min per hop (and back D - A)
 *   Bus          C - E - F    at :05 :25 :45 from C, 3 min per hop
 *   Tram          G - H       at :03 :18 :33 :48 from G, 4 min; G is 200 m from C (180 s footpath)
 *   I                         isolated, no service
 */
export function miniTimetable(window: 'day' | 'night' = 'day'): Timetable {
  const day = window === 'day';
  const start = day ? H10 : 26 * 3600;
  const end = start + 2 * 3600;
  return {
    version: 1,
    window,
    serviceDate: '2026-10-14',
    windowStart: start,
    windowEnd: end,
    feedVersion: 'fixture',
    stops: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((name, i) => ({
      id: `s${i}`,
      name,
      ...STOP_POS[i],
    })),
    routes: [
      {
        name: 'U1',
        mode: 'ubahn',
        stops: [A, B, C, D],
        trips: day ? trips(start, end + 3600, 600, 4, 120) : trips(start, end + 3600, 3600, 4, 120),
      },
      {
        name: 'U1',
        mode: 'ubahn',
        stops: [D, C, B, A],
        trips: day ? trips(start, end + 3600, 600, 4, 120) : trips(start, end + 3600, 3600, 4, 120),
      },
      ...(day
        ? [
            {
              name: '100',
              mode: 'bus' as const,
              stops: [C, E, F],
              trips: trips(start + 300, end + 3600, 1200, 3, 180),
            },
            {
              name: 'M1',
              mode: 'tram' as const,
              stops: [G, H],
              trips: trips(start + 180, end + 3600, 900, 2, 240),
            },
          ]
        : []),
    ],
    transfers: [
      { from: C, to: G, seconds: 180 },
      { from: G, to: C, seconds: 180 },
    ],
  };
}

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random network with irregular trips (including overtaking) for cross-checking against a reference. */
export function randomTimetable(seed: number, stopCount = 60, routeCount = 25): Timetable {
  const rand = rng(seed);
  const stops = Array.from({ length: stopCount }, (_, i) => ({
    id: `r${i}`,
    name: `R${i}`,
    lat: LAT + rand() * 6 * KM_LAT,
    lon: LON + rand() * 6 * KM_LON,
  }));
  const routes: Timetable['routes'] = [];
  for (let r = 0; r < routeCount; r++) {
    const len = 2 + Math.floor(rand() * 8);
    const seq: number[] = [];
    while (seq.length < len) {
      const s = Math.floor(rand() * stopCount);
      if (seq[seq.length - 1] !== s) seq.push(s);
    }
    const tripCount = 1 + Math.floor(rand() * 15);
    const tripsArr: number[][] = [];
    for (let t = 0; t < tripCount; t++) {
      let time = H10 - 1800 + Math.floor(rand() * 3 * 3600);
      const trip: number[] = [];
      for (let i = 0; i < len; i++) {
        trip.push(time);
        time += 30 + Math.floor(rand() * 400);
      }
      tripsArr.push(trip);
    }
    tripsArr.sort((a, b) => a[0] - b[0]);
    routes.push({ name: `L${r}`, mode: 'bus', stops: seq, trips: tripsArr });
  }
  const transfers: Timetable['transfers'] = [];
  for (let a = 0; a < stopCount; a++) {
    for (let b = 0; b < stopCount; b++) {
      if (a === b) continue;
      const dy = (stops[a].lat - stops[b].lat) / KM_LAT;
      const dx = (stops[a].lon - stops[b].lon) / KM_LON;
      const m = Math.sqrt(dx * dx + dy * dy) * 1000;
      if (m < 500) transfers.push({ from: a, to: b, seconds: Math.round(m / 1.2 + 60) });
    }
  }
  return {
    version: 1,
    window: 'day',
    serviceDate: '2026-10-14',
    windowStart: H10,
    windowEnd: H10 + 7200,
    feedVersion: 'random',
    stops,
    routes,
    transfers,
  };
}
