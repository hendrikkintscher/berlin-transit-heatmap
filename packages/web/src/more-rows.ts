// The drawer's list of connections: which rows are worth showing.

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
