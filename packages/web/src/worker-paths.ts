// Background downloads after the first map: the footpaths (walk.bin) and the lines'
// courses (lines.bin), and the Lines overlay drawn along them.
import {
  decodeLines,
  gridLayout,
  hopCourse,
  loadWalkNetwork,
  snapCellsInSteps,
  snapStops,
  type LineShapes,
  type PreparedTimetable,
  type routeUsage,
  type WalkNetwork,
} from '@berlin-transit-heatmap/routing';
import type { FeatureCollection, LineString } from 'geojson';
import { dataUrl } from './data-url';
import type { RouteProps } from './protocol';
import { post } from './worker-post';
import { CELL_M } from './worker-runs';
import { dataBase, readWithProgress } from './worker-timetables';

/** Only lines at least this busy get a name label. */
const MIN_LABEL_SHARE = 0.03;

/**
 * The footpath network, fetched in the background when the UI asks (once the first map
 * is on screen), so the first map never shares the connection with it. Until it is ready,
 * walks are straight lines; the UI recomputes the map when it arrives. Its download
 * reports progress, and the grid snapping runs in steps, so taps in the meantime are
 * answered.
 */
export let walk: WalkNetwork | undefined;
let walkStarted = false;
/** Walking speed from the menu, set by each compute and layers request. */
export let walkSpeedMps: number | undefined;
export function setWalkKmh(kmh: number) {
  walkSpeedMps = kmh / 3.6;
}

export async function loadWalk(): Promise<void> {
  if (walkStarted) return;
  walkStarted = true;
  try {
    const res = await fetch(dataUrl(dataBase, 'walk.bin'));
    if (!res.ok || !res.body) throw new Error(`walk.bin: ${res.status}`);
    const buf = await readWithProgress(res.body, res, (loaded, total) =>
      post({ type: 'walkProgress', loaded, total }),
    );
    const net = loadWalkNetwork(buf);
    // Snapping the map grid to the network takes a moment; do it now rather than on a
    // tap, a slice at a time with pauses for any messages that queued up.
    const layout = gridLayout({ cellSizeM: CELL_M });
    const steps = snapCellsInSteps(net, layout.bbox, layout.cols, layout.rows);
    while (!steps.next().done) await new Promise((r) => setTimeout(r, 0));
    // The stops too, for the shown timetable, so the next map or tap does not pay for it.
    if (lastTimetable) snapStops(net, lastTimetable);
    walk = net;
    post({ type: 'walk' });
  } catch (err) {
    // Straight-line walking stays in place.
    console.warn('Walking network not used:', err);
    post({ type: 'walkFailed' });
  }
}

/**
 * The hops' courses along tracks and roads (lines.bin), fetched once the first map is
 * out; for hops it does not cover, lines run straight from stop to stop.
 */
let lineShapes: LineShapes | null = null;
let linesStarted = false;
/**
 * The app asked for the footpaths (the base map is up): the lines' courses may come too.
 * Until then they wait, so they do not hold up the base map's tiles.
 */
let backgroundOk = false;
/** The last map's timetable, for the lines' courses once they may load. */
export let lastTimetable: PreparedTimetable | null = null;
/** The last map's lines, redrawn along their courses when lines.bin arrives. */
let lastRoutes: { id: number; tt: PreparedTimetable; used: Segments } | null = null;

/** The app asked for the footpaths: they load now, and the lines' courses with them. */
export function startBackground() {
  backgroundOk = true;
  void loadWalk();
  if (lastTimetable) void loadLines(lastTimetable);
}

/** A map's lines, redrawn along their courses when lines.bin arrives. */
export function setLastRoutes(routes: { id: number; tt: PreparedTimetable; used: Segments }) {
  lastRoutes = routes;
}

/** A map from `tt` is out: the lines' courses may load from now on (never before it). */
export function mapShown(tt: PreparedTimetable) {
  lastTimetable = tt;
  if (backgroundOk) void loadLines(tt);
}

async function loadLines(tt: PreparedTimetable): Promise<void> {
  if (linesStarted) return;
  linesStarted = true;
  try {
    const res = await fetch(dataUrl(dataBase, 'lines.bin'));
    if (res.ok)
      lineShapes = decodeLines(await res.arrayBuffer(), tt.stopCount, (s) => [
        tt.stopLon[s]!,
        tt.stopLat[s]!,
      ]);
  } catch (err) {
    console.warn('Line courses not used:', err);
  }
  linesSettled = true;
  const last = lastRoutes;
  if (last)
    post({
      type: 'routes',
      id: last.id,
      routes: usageGeoJSON(last.tt, last.used),
      labels: labelLines(last.tt, last.used),
    });
}

/**
 * Lines wait for their courses, so the map never shows a line cutting corners that a
 * trip then draws along the tracks (only without lines.bin do they run straight).
 */
export let linesSettled = false;
export const NO_LINES = { type: 'FeatureCollection' as const, features: [] };

/** [lon, lat] points from stop to stop along the hops' courses. */
export function course(tt: PreparedTimetable, stops: number[]): [number, number][] {
  const pos = (s: number): [number, number] => [tt.stopLon[s]!, tt.stopLat[s]!];
  if (stops.length < 2) return stops.map(pos);
  const out: [number, number][] = [pos(stops[0]!)];
  for (let i = 1; i < stops.length; i++)
    out.push(...hopCourse(lineShapes, stops[i - 1]!, stops[i]!, pos).slice(1));
  return out;
}

type Segments = ReturnType<typeof routeUsage>;
const lineName = (s: Segments[number]) => s.names.slice(0, 4).join('/');

export function usageGeoJSON(
  tt: PreparedTimetable,
  segments: Segments,
): FeatureCollection<LineString, RouteProps> {
  return {
    type: 'FeatureCollection',
    // Lightest first so heavy lines draw on top.
    features: [...segments].reverse().map((s) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: course(tt, [s.a, s.b]) },
      properties: { share: s.share, mode: s.mode, names: lineName(s) },
    })),
  };
}

/**
 * Chains hops that carry the same line names into polylines, so each line gets a
 * few spaced labels instead of one per stop-to-stop hop.
 */
export function labelLines(
  tt: PreparedTimetable,
  segments: Segments,
): FeatureCollection<LineString, { names: string }> {
  const groups = new Map<string, Segments>();
  for (const s of segments) {
    if (s.share < MIN_LABEL_SHARE) continue;
    const name = lineName(s);
    groups.set(name, [...(groups.get(name) ?? []), s]);
  }
  const features: FeatureCollection<LineString, { names: string }>['features'] = [];
  for (const [names, segs] of groups) {
    const adj = new Map<number, number[]>();
    for (const s of segs) {
      adj.set(s.a, [...(adj.get(s.a) ?? []), s.b]);
      adj.set(s.b, [...(adj.get(s.b) ?? []), s.a]);
    }
    const used = new Set<string>();
    const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    const walk = (start: number, next: number) => {
      const path = [start];
      let prev = start;
      let cur = next;
      for (;;) {
        used.add(key(prev, cur));
        path.push(cur);
        const nbrs = adj.get(cur)!;
        if (nbrs.length !== 2) break;
        const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0];
        if (used.has(key(cur, nxt))) break;
        prev = cur;
        cur = nxt;
      }
      return path;
    };
    // Start at ends and junctions first, then whatever is left (loops).
    const starts = [...adj.keys()].sort(
      (x, y) => Number(adj.get(x)!.length === 2) - Number(adj.get(y)!.length === 2),
    );
    for (const a of starts) {
      for (const b of adj.get(a)!) {
        if (used.has(key(a, b))) continue;
        const path = walk(a, b);
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: course(tt, path),
          },
          properties: { names },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
