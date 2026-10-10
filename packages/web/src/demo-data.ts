// Fallback timetable used when ./data/ has no published timetable yet (local dev, or
// before the first timetable build). Fake stops on a ~600 m lattice over Berlin.
import type { Timetable } from './routing';

export function demoTimetable(window: 'day' | 'night'): Timetable {
  const stops: Timetable['stops'] = [];
  const cLat = 52.515;
  const cLon = 13.405;
  for (let lat = 52.34; lat <= 52.69; lat += 0.0055) {
    for (let lon = 13.08; lon <= 13.77; lon += 0.009) {
      // Rough ellipse around the city so the demo looks like Berlin, not a rectangle.
      const dx = (lon - cLon) / 0.33;
      const dy = (lat - cLat) / 0.17;
      if (dx * dx + dy * dy > 1) continue;
      stops.push({ id: `demo-${stops.length}`, name: 'Demo stop', lat, lon });
    }
  }
  return {
    version: 1,
    window,
    serviceDate: 'demo',
    windowStart: window === 'day' ? 36000 : 93600,
    windowEnd: window === 'day' ? 43200 : 100800,
    feedVersion: 'demo',
    stops,
    routes: [],
    transfers: [],
  };
}
