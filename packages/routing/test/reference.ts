import { distanceM, WALK_SPEED_MPS, type Origin, type Timetable } from '../src';

/**
 * Brute-force reference: an independent Connection Scan per candidate
 * departure, unlimited transfers, footpaths only after leaving a vehicle (one
 * hop, never chained), same as the RAPTOR model. Exact for that model. Returns best travel time per stop.
 */
export function referenceTravelTimes(
  tt: Timetable,
  origin: Origin,
  maxInitialWalkSeconds = 900,
): Float64Array {
  return referenceProfile(tt, origin, maxInitialWalkSeconds).best;
}

/**
 * Reference typical time: the average over leaving at t uniform in the window of
 * (earliest arrival over departures >= t) - t, scanning departures up to `horizon`
 * past the window; where nothing is reachable late in the window, the average covers
 * only the earlier part. Capped by walking straight from the origin.
 */
export function referenceTypical(
  tt: Timetable,
  origin: Origin,
  horizon: number,
  maxInitialWalkSeconds = 900,
): Float64Array {
  const { perDeparture, walk } = referenceProfile(tt, origin, maxInitialWalkSeconds, horizon);
  const S = tt.stops.length;
  const ws = tt.windowStart;
  const we = tt.windowEnd;
  const deps = [...perDeparture.keys()].sort((a, b) => b - a);
  const out = new Float64Array(S).fill(Infinity);
  for (let s = 0; s < S; s++) {
    let ea = Infinity;
    let integral = 0;
    let coverEnd = ws;
    let covering = false;
    for (let k = 0; k < deps.length; k++) {
      const d = deps[k];
      ea = Math.min(ea, perDeparture.get(d)![s]);
      const lo = k + 1 < deps.length ? deps[k + 1] : -Infinity;
      if (ea === Infinity) continue;
      if (!covering) {
        covering = true;
        coverEnd = Math.max(ws, Math.min(d, we));
      }
      const a = Math.max(lo, ws);
      const b = Math.min(d, we);
      if (b > a) integral += ea * (b - a) - (b * b - a * a) / 2;
    }
    const covered = coverEnd - ws;
    let v = covering && covered > 0 ? integral / covered : Infinity;
    if (walk[s] < v) v = walk[s];
    out[s] = v;
  }
  return out;
}

function referenceProfile(
  tt: Timetable,
  origin: Origin,
  maxInitialWalkSeconds: number,
  horizon = 0,
): { best: Float64Array; perDeparture: Map<number, Float64Array>; walk: Float64Array } {
  const S = tt.stops.length;
  interface Conn {
    trip: number;
    from: number;
    to: number;
    dep: number;
    arr: number;
  }
  const conns: Conn[] = [];
  let tripId = 0;
  for (const route of tt.routes) {
    for (const trip of route.trips) {
      for (let i = 0; i + 1 < route.stops.length; i++) {
        conns.push({
          trip: tripId,
          from: route.stops[i],
          to: route.stops[i + 1],
          dep: trip[i],
          arr: trip[i + 1],
        });
      }
      tripId++;
    }
  }
  conns.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const footpaths: { to: number; seconds: number }[][] = Array.from({ length: S }, () => []);
  for (const t of tt.transfers) footpaths[t.from].push({ to: t.to, seconds: t.seconds });

  const access: { stop: number; walk: number }[] = [];
  tt.stops.forEach((s, i) => {
    const walk = Math.round(distanceM(origin.lat, origin.lon, s.lat, s.lon) / WALK_SPEED_MPS);
    if (walk <= maxInitialWalkSeconds) access.push({ stop: i, walk });
  });

  const best = new Float64Array(S).fill(Infinity);
  for (const a of access) best[a.stop] = Math.min(best[a.stop], a.walk);

  const perDeparture = new Map<number, Float64Array>();
  const candidates = new Set<number>();
  for (const a of access) {
    tt.routes.forEach((route) => {
      route.stops.forEach((s, i) => {
        if (s !== a.stop || i === route.stops.length - 1) return;
        for (const trip of route.trips) {
          const d = trip[i] - a.walk;
          if (d >= tt.windowStart && d <= tt.windowEnd + horizon) candidates.add(d);
        }
      });
    });
  }

  for (const dep of candidates) {
    // arrAt: earliest arrival by any means (boarding is allowed from it).
    // byVehicle: earliest arrival by vehicle (footpaths start from it), kept
    // separately so a stop first reached on foot still gets its footpaths
    // relaxed when a vehicle arrives later.
    const arrAt = new Float64Array(S).fill(Infinity);
    const byVehicle = new Float64Array(S).fill(Infinity);
    for (const a of access) arrAt[a.stop] = Math.min(arrAt[a.stop], dep + a.walk);
    const boarded = new Uint8Array(tripId);
    for (const c of conns) {
      if (c.dep < dep) continue;
      if (!boarded[c.trip] && arrAt[c.from] <= c.dep) boarded[c.trip] = 1;
      if (!boarded[c.trip]) continue;
      if (c.arr < byVehicle[c.to]) {
        byVehicle[c.to] = c.arr;
        if (c.arr < arrAt[c.to]) arrAt[c.to] = c.arr;
        for (const f of footpaths[c.to]) {
          if (c.arr + f.seconds < arrAt[f.to]) arrAt[f.to] = c.arr + f.seconds;
        }
      }
    }
    perDeparture.set(dep, arrAt);
    if (dep <= tt.windowEnd)
      for (let s = 0; s < S; s++) if (arrAt[s] - dep < best[s]) best[s] = arrAt[s] - dep;
  }
  const walk = new Float64Array(S).fill(Infinity);
  for (const a of access) walk[a.stop] = Math.min(walk[a.stop], a.walk);
  return { best, perDeparture, walk };
}
