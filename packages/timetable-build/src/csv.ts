import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

/** Splits one CSV line (RFC 4180 quoting, no embedded newlines, which GTFS feeds do not use). */
export function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export type Row = (column: string) => string;

/**
 * Streams a CSV file row by row. `onRow` receives a getter by column name; a
 * missing column reads as ''. Lines are never held in memory beyond one row.
 */
export async function readCsv(input: Readable, onRow: (get: Row) => void): Promise<number> {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let index: Map<string, number> | null = null;
  let fields: string[] = [];
  const get: Row = (column) => {
    const i = index!.get(column);
    return i === undefined ? '' : (fields[i] ?? '');
  };
  let rows = 0;
  for await (const line of rl) {
    if (index === null) {
      index = new Map(splitCsvLine(line.replace(/^\uFEFF/, '')).map((h, i) => [h.trim(), i]));
      continue;
    }
    if (line === '') continue;
    fields = splitCsvLine(line);
    rows++;
    onRow(get);
  }
  return rows;
}

/** Parses GTFS "H:MM:SS" (hours may exceed 24) into seconds; NaN when empty. */
export function parseTime(value: string): number {
  if (value === '') return NaN;
  const a = value.indexOf(':');
  const b = value.indexOf(':', a + 1);
  if (a < 0 || b < 0) return NaN;
  return (
    Number(value.slice(0, a)) * 3600 +
    Number(value.slice(a + 1, b)) * 60 +
    Number(value.slice(b + 1))
  );
}
