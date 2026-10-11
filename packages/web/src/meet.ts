// Suggested meeting points: with two starts, a few stations both people reach quickly.

export interface MeetCandidate {
  name: string;
  lat: number;
  lon: number;
}

export interface MeetSuggestion extends MeetCandidate {
  /** Minutes for the first and the second start. */
  a: number;
  b: number;
}

/** Suggestions closer than this to a better one are left out, so they spread out. */
export const MEET_SPREAD_M = 1500;

/**
 * The best `count` candidates: smallest slower-of-both time (in whole minutes), the sum
 * of both as the tie-breaker so neither person carries the whole trip. After each pick,
 * everything within `spreadM` of it drops out. `seconds(i)` gives candidate i's times.
 */
export function suggestMeetingPoints(
  candidates: MeetCandidate[],
  seconds: (i: number) => [number, number],
  count = 3,
  spreadM = MEET_SPREAD_M,
): MeetSuggestion[] {
  const scored: MeetSuggestion[] = [];
  candidates.forEach((c, i) => {
    const [sa, sb] = seconds(i);
    if (!(sa < Infinity && sb < Infinity)) return;
    scored.push({ ...c, a: Math.round(sa / 60), b: Math.round(sb / 60) });
  });
  scored.sort((x, y) => Math.max(x.a, x.b) - Math.max(y.a, y.b) || x.a + x.b - (y.a + y.b));
  const picked: MeetSuggestion[] = [];
  for (const s of scored) {
    if (picked.length >= count) break;
    if (picked.some((p) => distanceM(p, s) < spreadM)) continue;
    picked.push(s);
  }
  return picked;
}

function distanceM(p: { lat: number; lon: number }, q: { lat: number; lon: number }): number {
  const dy = (p.lat - q.lat) * 111_320;
  const dx = (p.lon - q.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
