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
 * The best `count` candidates by slowest trip + average trip (in whole minutes): one more
 * minute for the slowest is worth it when the group saves at least (people + 1) minutes,
 * so nobody carries the whole trip and three or more people are not held to the one
 * slowest minute. Ties go to the shorter slowest trip. After each pick, everything within
 * `spreadM` of it drops out. `seconds(i)` gives candidate i's times, one per start.
 */
export function suggestMeetingPoints(
  candidates: MeetCandidate[],
  seconds: (i: number) => number[],
  count = 3,
  spreadM = MEET_SPREAD_M,
): MeetSuggestion[] {
  const scored: (MeetSuggestion & { max: number; score: number })[] = [];
  candidates.forEach((c, i) => {
    const s = seconds(i);
    if (!s.every((v) => v < Infinity)) return;
    const mins = s.map((v) => Math.round(v / 60));
    const max = Math.max(...mins);
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    scored.push({ ...c, mins, max, score: max + avg });
  });
  scored.sort((x, y) => x.score - y.score || x.max - y.max);
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
