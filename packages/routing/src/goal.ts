import type { HeatGrid, StopProfile } from './types';

/**
 * Maps to a destination with a time to leave: how long from every place, leaving then,
 * until the destination. Built from a profile search on the reversed timetable from the
 * destination (`profile` in TravelTimeOptions): per stop, the moments to arrive by (the
 * profile's departures, negated) and the latest leaving each allows (its arrivals,
 * negated). Both rise along a stop's events, so "the earliest arrival when leaving at
 * `t` or later" is the first event whose latest leaving is no earlier than `t`.
 *
 * The walk from a place to its stop comes before the ride, so unlike a map from a start
 * it cannot just be added to the stop's time: leaving a cell at `leave` one is at the stop
 * only after the walk, and catches the first vehicle after that. A map is therefore made in
 * two steps (Nächste): stop times that are the least waiting-plus-riding for arriving at
 * the stop within a few minutes of `leave` (goalWindow, a good guess which stop is best for a
 * cell), a grid from them (heatGrid with trackStops), and the cells corrected to the
 * vehicle caught after the walk to their stop (goalCells), and walking all the way to the
 * Ziel kept where it beats that.
 */

/** The first event of stop `s` that allows leaving at `leave` or later; -1 if none does. */
function firstAllowing(p: StopProfile, s: number, leave: number): number {
  let lo = p.offset[s];
  let hi = p.offset[s + 1];
  const end = hi;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (-p.arrival[mid] >= leave) hi = mid;
    else lo = mid + 1;
  }
  return lo < end ? lo : -1;
}

/**
 * Leaving at any moment of [from, to]: per stop the average seconds until the destination
 * (waiting included, over the moments that still get there) when `typical`, else the least.
 * `pick`, if given and not `typical`: filled with each stop's event giving the least (-1
 * where none), so a map's lines can follow the trips its cells take (goalUsage).
 */
export function goalWindow(
  p: StopProfile,
  from: number,
  to: number,
  typical: boolean,
  pick?: Int32Array,
): Float32Array {
  const S = p.offset.length - 1;
  const out = new Float32Array(S).fill(Infinity);
  pick?.fill(-1);
  for (let s = 0; s < S; s++) {
    let before = -Infinity;
    let sum = 0;
    let covered = 0;
    let least = Infinity;
    for (let i = p.offset[s]; i < p.offset[s + 1]; i++) {
      const reach = -p.arrival[i];
      const arrive = -p.departure[i];
      // Leaving in (before, reach] gets there by `arrive`.
      const a = Math.max(before, from);
      const b = Math.min(reach, to);
      before = reach;
      if (b <= a) continue;
      covered += b - a;
      sum += arrive * (b - a) - (b * b - a * a) / 2;
      if (arrive - b < least) {
        least = arrive - b;
        if (pick) pick[s] = i;
      }
    }
    if (typical && covered > 0) out[s] = sum / covered;
    else if (!typical && least < Infinity) out[s] = least;
  }
  return out;
}

/**
 * A grid made from stop times that are for leaving the stop at `leave` (goalWindow), corrected
 * for the way to the stop: someone leaving a cell at `leave` is at the stop only after the
 * walk, and catches the first vehicle after that. Each cell keeps the stop it came from and
 * takes that stop's arrival for leaving after its walk (the walk is what the grid added to
 * the stop's time). Cells that stop cannot serve in time become unreachable.
 *
 * `walkOnly`: the cells around the Ziel made without any stop (a grid of `window` cells at
 * (c0, r0)), whose walk all the way is no later than waiting for a vehicle, however it looked
 * before the correction. `cells`, if given (one per profile event): each event gets one
 * for every cell that takes it, for goalUsage.
 */
export function goalCells(
  grid: HeatGrid,
  stopSeconds: Float32Array,
  p: StopProfile,
  leave: number,
  walkOnly?: { grid: HeatGrid; c0: number; r0: number },
  cells?: Float64Array,
): void {
  const stop = grid.stop;
  if (!stop) throw new Error('goalCells needs a grid made with trackStops');
  const seconds = grid.seconds;
  const w = walkOnly?.grid;
  const c0 = walkOnly?.c0 ?? 0;
  const r0 = walkOnly?.r0 ?? 0;
  for (let row = 0, k = 0; row < grid.rows; row++) {
    const wr = row - r0;
    const inRows = w !== undefined && wr >= 0 && wr < w.rows;
    for (let col = 0; col < grid.cols; col++, k++) {
      const s = stop[k];
      let event = -1;
      if (s >= 0 && seconds[k] !== Infinity) {
        event = firstAllowing(p, s, leave + (seconds[k] - stopSeconds[s]));
        seconds[k] = event < 0 ? Infinity : -p.departure[event] - leave;
      }
      const wc = col - c0;
      if (inRows && wc >= 0 && wc < w.cols) {
        const v = w.seconds[wr * w.cols + wc];
        if (v < seconds[k]) {
          seconds[k] = v;
          stop[k] = -1;
          event = -1;
        }
      }
      if (cells && event >= 0) cells[event]++;
    }
  }
}

/** The earliest arrival (seconds of the day) at the destination leaving stop `s` at `leave` or later. */
export function goalArrival(p: StopProfile, s: number, leave: number): number {
  const i = firstAllowing(p, s, leave);
  return i < 0 ? Infinity : -p.departure[i];
}
