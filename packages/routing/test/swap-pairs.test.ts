/**
 * Roadmap 0.13.3: trips that came out different when the map moved to the trip's other
 * end (collected with bench/swap.ts on the real timetable, seed 1, before the change).
 * Each must now come out again when asked for within its own span (leaving no earlier,
 * arriving no later), as the app asks once the map is at the other end. Skipped unless ROUTING_SLOW=1
 * (`pnpm test:slow`); files are cached in .data/.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadTimetable,
  loadWalkNetwork,
  reverseTimetable,
  tripBetween,
  type PreparedTimetable,
  type WalkNetwork,
} from '../src';
import { ensureFile, readTimetable } from '../bench/data';

const SLOW = process.env.ROUTING_SLOW === '1';

/** From, to (lat, lon each) and the moment of leaving (seconds of the day). */
const PAIRS: [number, number, number, number, number][] = [
  [52.45988, 13.40555, 52.45487, 13.2621, 37024],
  [52.56496, 13.31189, 52.52252, 13.36351, 39248],
  [52.46134, 13.37967, 52.5729, 13.37268, 37201],
  [52.53227, 13.30154, 52.5937, 13.24316, 38024],
  [52.52847, 13.5283, 52.55494, 13.2073, 39340],
  [52.50286, 13.44754, 52.58645, 13.46621, 38600],
  [52.51549, 13.58932, 52.48716, 13.45806, 38377],
  [52.50769, 13.4985, 52.43219, 13.23622, 36570],
  [52.57901, 13.31074, 52.59331, 13.46901, 38629],
  [52.49629, 13.26614, 52.55745, 13.5507, 38629],
  [52.58317, 13.50694, 52.55552, 13.28489, 39073],
  [52.57951, 13.31432, 52.54162, 13.31402, 36199],
  [52.58178, 13.5144, 52.57582, 13.47646, 37010],
  [52.44825, 13.52207, 52.5164, 13.28338, 36957],
  [52.56711, 13.23939, 52.4587, 13.26121, 38645],
  [52.49396, 13.26611, 52.44428, 13.25547, 38952],
  [52.56124, 13.4733, 52.57527, 13.54904, 36697],
  [52.59175, 13.36795, 52.48888, 13.50082, 38149],
  [52.43195, 13.33575, 52.45536, 13.46932, 37888],
  [52.52983, 13.55355, 52.45017, 13.33372, 36462],
  [52.53508, 13.47992, 52.5896, 13.33029, 36607],
  [52.4569, 13.47934, 52.55209, 13.2442, 38676],
  [52.47404, 13.38971, 52.46657, 13.3459, 37712],
  [52.46332, 13.2579, 52.58208, 13.26955, 38149],
  // Moabit to Lichtenberg: bus 123 or 142 to the Hauptbahnhof.
  [52.53449, 13.3591, 52.52859, 13.54876, 39456],
  // Springpfuhl to Neukölln: the M77 to Rixdorfer Str. or on to Friedhof Mariendorf.
  [52.53253, 13.54131, 52.45303, 13.40175, 36005],
  // Moabit to Blankenburg: a long walk from the S-Bahn or bus 358.
  [52.5204, 13.3604, 52.599, 13.45713, 39466],
];

describe.skipIf(!SLOW)('the same trip from either end', { timeout: 120_000 }, () => {
  let fwd: PreparedTimetable;
  let back: PreparedTimetable;
  let walk: WalkNetwork;

  beforeAll(async () => {
    const raw = await readTimetable('day');
    fwd = loadTimetable(raw);
    back = loadTimetable(reverseTimetable(raw, raw.windowEnd, raw.windowEnd + 3600));
    walk = loadWalkNetwork(readFileSync(await ensureFile('walk.bin')));
  }, 120_000);

  it.each(PAIRS)('%f,%f to %f,%f leaving at %i', (la, lo, lb, lob, t) => {
    const a = { lat: la, lon: lo };
    const b = { lat: lb, lon: lob };
    const opts = { walk };
    // The map moved to the other end asks for the trip within its own span.
    const leaving = tripBetween(fwd, back, a, b, { leave: t }, opts)!;
    expect(leaving).not.toBeNull();
    const span = { leave: leaving.leave, arrive: leaving.arrive };
    expect(tripBetween(fwd, back, a, b, span, opts)).toEqual(leaving);
    const arriving = tripBetween(fwd, back, a, b, { arrive: t + 1800 }, opts)!;
    expect(arriving).not.toBeNull();
    const back2 = { leave: arriving.leave, arrive: arriving.arrive };
    expect(tripBetween(fwd, back, a, b, back2, opts)).toEqual(arriving);
  });
});
