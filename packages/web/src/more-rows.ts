// The drawer's list of connections: which rows are worth showing.
import type { FromWorker, TripLeg } from './protocol';

type Trip = Extract<FromWorker, { type: 'trip' }>;

/**
 * The rows worth showing, in time order: none that another row beats, leaving no earlier
 * (arriving: arriving no later) and arriving no later (arriving: leaving no earlier).
 * Of equal rows the first given stays, so the shown connection's own rides win a tie.
 */
export function bestRows<R extends { start: number; end: number }>(rows: R[], max: number): R[] {
  const order = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.start - a.r.start || a.r.end - b.r.end || a.i - b.i);
  const kept: R[] = [];
  let minEnd = Infinity;
  for (const { r } of order)
    if (r.end < minEnd) {
      kept.push(r);
      minEnd = r.end;
    }
  return kept.reverse().slice(0, max);
}

type Ride = Extract<TripLeg, { type: 'ride' }>;
type Feature = Trip['lines']['features'][number];
const rides = (legs: TripLeg[]) => legs.filter((l): l is Ride => l.type === 'ride');
const lastIndex = <T>(a: T[], ok: (x: T) => boolean) => {
  for (let i = a.length - 1; i >= 0; i--) if (ok(a[i]!)) return i;
  return -1;
};

/** A connection by its vehicles (each ride's line, stops and departure), '' without rides. */
export function ridesKey(c: Trip | undefined): string {
  const j = c?.journeys.length === 1 ? c.journeys[0] : null;
  return rides(j?.legs ?? [])
    .map((l) => `${l.name}|${l.from}|${l.to}|${l.dep}`)
    .join(';');
}

/** The walks before the first ride and after the last one (legs and lines), and its end stops. */
function ends(c: Trip) {
  const legs = c.journeys[0]!.legs;
  const f = c.lines.features;
  const r0 = legs.findIndex((l) => l.type === 'ride');
  const r1 = lastIndex(legs, (l) => l.type === 'ride');
  const f0 = f.findIndex((x) => !x.properties.walk);
  const f1 = lastIndex(f, (x) => !x.properties.walk);
  // The stop itself by its place (names repeat: an S-Bahn and a U-Bahn platform): the
  // marked stops are where the first ride starts and the last one ends.
  const marks = c.stops.features.filter((x) => x.properties.end);
  const place = (m: (typeof marks)[number] | undefined) => m?.geometry.coordinates.join();
  const first = rides(legs)[0]!;
  const last = rides(legs).at(-1)!;
  return {
    first,
    last,
    board: place(marks[0]),
    alight: place(marks.at(-1)),
    before: { legs: legs.slice(0, r0), lines: f0 < 0 ? [] : f.slice(0, f0) },
    after: { legs: legs.slice(r1 + 1), lines: f1 < 0 ? [] : f.slice(f1 + 1) },
    middle: { legs: legs.slice(r0, r1 + 1), lines: f0 < 0 ? f : f.slice(f0, f1 + 1) },
  };
}

/**
 * The drawer's rows fitted to the shown connection redone with other walks (the footpaths
 * came in), when its vehicles stayed the same: a row that boards at the same stop takes
 * its walk there, minutes and line, and leaves that much before its first vehicle; one
 * that gets off at the same stop likewise at the end. The rides themselves stay.
 */
export function refitRows(rows: Trip[], shown: Trip): Trip[] {
  const j = shown.journeys[0];
  if (!j || j.leave === undefined || j.arrive === undefined || !ridesKey(shown)) return rows;
  const s = ends(shown);
  if (s.first.dep === undefined || s.last.arr === undefined) return rows;
  const before = s.first.dep - j.leave;
  const after = j.arrive - s.last.arr;
  return rows.map((row) => {
    const r = row.journeys[0];
    if (!r || row.journeys.length !== 1 || !ridesKey(row)) return row;
    const e = ends(row);
    const head = !!e.board && e.board === s.board && e.first.dep !== undefined;
    const tail = !!e.alight && e.alight === s.alight && e.last.arr !== undefined;
    if (!head && !tail) return row;
    const pick = <T>(same: boolean, mine: T, theirs: T) => (same ? theirs : mine);
    const legs = [
      ...pick(head, e.before.legs, s.before.legs),
      ...e.middle.legs,
      ...pick(tail, e.after.legs, s.after.legs),
    ];
    const features: Feature[] = [
      ...pick(head, e.before.lines, s.before.lines),
      ...e.middle.lines,
      ...pick(tail, e.after.lines, s.after.lines),
    ];
    const leave = head ? e.first.dep! - before : r.leave;
    const arrive = tail ? e.last.arr! + after : r.arrive;
    return {
      ...row,
      journeys: [{ ...r, legs, leave, arrive }],
      lines: { ...row.lines, features },
    };
  });
}
