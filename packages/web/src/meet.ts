// Suggested meeting points: with two or more starts, a few stations everyone reaches quickly.

export interface MeetCandidate {
  name: string;
  lat: number;
  lon: number;
}

export interface MeetSuggestion extends MeetCandidate {
  /** Minutes from each start, in start order. */
  mins: number[];
}

/** Suggestions closer than this to a better one are left out, so they spread out. */
export const MEET_SPREAD_M = 1500;

/**
 * The best `count` candidates: smallest slowest-of-all time (in whole minutes), the sum
 * as the tie-breaker so nobody carries the whole trip. After each pick, everything within
 * `spreadM` of it drops out. `seconds(i)` gives candidate i's times, one per start.
 */
export function suggestMeetingPoints(
  candidates: MeetCandidate[],
  seconds: (i: number) => number[],
  count = 3,
  spreadM = MEET_SPREAD_M,
): MeetSuggestion[] {
  const scored: (MeetSuggestion & { max: number; sum: number })[] = [];
  candidates.forEach((c, i) => {
    const s = seconds(i);
    if (!s.every((v) => v < Infinity)) return;
    const mins = s.map((v) => Math.round(v / 60));
    scored.push({ ...c, mins, max: Math.max(...mins), sum: mins.reduce((a, b) => a + b, 0) });
  });
  scored.sort((x, y) => x.max - y.max || x.sum - y.sum);
  const picked: MeetSuggestion[] = [];
  for (const s of scored) {
    if (picked.length >= count) break;
    if (picked.some((p) => distanceM(p, s) < spreadM)) continue;
    picked.push({ name: s.name, lat: s.lat, lon: s.lon, mins: s.mins });
  }
  return picked;
}

function distanceM(p: { lat: number; lon: number }, q: { lat: number; lon: number }): number {
  const dy = (p.lat - q.lat) * 111_320;
  const dx = (p.lon - q.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
