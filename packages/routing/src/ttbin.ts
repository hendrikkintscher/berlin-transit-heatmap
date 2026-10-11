/**
 * Contract 4: the timetable as a compact binary file (`timetable-<window>.bin`), the
 * same content as the JSON file (Contract 1) without the GTFS stop ids, at about a
 * third of the gzipped size and much quicker to read. Little-endian:
 * u32 magic "BTHT", u8 version 1, then unsigned LEB128 varints (svar: zig-zag signed):
 * - the header: byte length, then UTF-8 JSON with version, window, serviceDate,
 *   windowStart, windowEnd and feedVersion;
 * - a string table: count, then per string its UTF-8 byte length and bytes;
 * - stops: count; per stop svar lon and lat in 1e-5 degrees from the previous stop,
 *   the name's string index, flags (bit 0: not step-free) and parent + 1 (0: none);
 * - routes: count; per route the name's string index, mode index (MODES), flags
 *   (bit 0: not step-free), stop count, svar stop index deltas, trip count, then per
 *   trip svar its first time minus the previous trip's, and per hop svar the hop
 *   time minus the previous trip's hop time;
 * - transfers: per stop the count, then the targets in ascending order (svar from the
 *   stop for the first, gaps after), then the seconds.
 *
 * This file imports nothing, so timetable-build can use the encoder directly.
 */

const MAGIC = 0x54485442;
const COORD_SCALE = 1e5;
const MODES = ['sbahn', 'ubahn', 'tram', 'bus', 'ferry', 'regional', 'other'] as const;

/** The shape of a Contract 1 timetable, as far as this file needs it. */
export interface TimetableData {
  version: 1;
  window: string;
  serviceDate: string;
  windowStart: number;
  windowEnd: number;
  feedVersion: string;
  stops: {
    id: string;
    name: string;
    lat: number;
    lon: number;
    parent?: number;
    stepFree?: false;
  }[];
  routes: {
    name: string;
    mode: (typeof MODES)[number];
    stops: number[];
    trips: number[][];
    stepFree?: false;
  }[];
  transfers: { from: number; to: number; seconds: number }[];
}

export function encodeTimetable(tt: TimetableData): Uint8Array {
  const out: number[] = [];
  const uvar = (v: number) => {
    if (!(v >= 0) || !Number.isInteger(v)) throw new Error(`Cannot encode ${v}`);
    while (v >= 0x80) {
      out.push((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    out.push(v);
  };
  const svar = (v: number) => uvar(v < 0 ? -2 * v - 1 : 2 * v);
  const enc = new TextEncoder();
  const bytes = (b: Uint8Array) => {
    uvar(b.length);
    for (const x of b) out.push(x);
  };
  out.push(0x42, 0x54, 0x48, 0x54, 1);
  const { version, window, serviceDate, windowStart, windowEnd, feedVersion } = tt;
  bytes(
    enc.encode(
      JSON.stringify({ version, window, serviceDate, windowStart, windowEnd, feedVersion }),
    ),
  );

  const strings: string[] = [];
  const index = new Map<string, number>();
  const str = (s: string) => {
    let i = index.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      index.set(s, i);
    }
    return i;
  };
  for (const s of tt.stops) str(s.name);
  for (const r of tt.routes) str(r.name);
  uvar(strings.length);
  for (const s of strings) bytes(enc.encode(s));

  uvar(tt.stops.length);
  let px = 0;
  let py = 0;
  for (const s of tt.stops) {
    const x = Math.round(s.lon * COORD_SCALE);
    const y = Math.round(s.lat * COORD_SCALE);
    svar(x - px);
    svar(y - py);
    px = x;
    py = y;
    uvar(str(s.name));
    uvar(s.stepFree === false ? 1 : 0);
    uvar(s.parent === undefined ? 0 : s.parent + 1);
  }

  uvar(tt.routes.length);
  for (const r of tt.routes) {
    uvar(str(r.name));
    const m = MODES.indexOf(r.mode);
    uvar(m < 0 ? MODES.length - 1 : m);
    uvar(r.stepFree === false ? 1 : 0);
    uvar(r.stops.length);
    let prev = 0;
    for (const s of r.stops) {
      svar(s - prev);
      prev = s;
    }
    uvar(r.trips.length);
    let last: number[] | null = null;
    for (const trip of r.trips) {
      if (trip.length !== r.stops.length) throw new Error(`Trip length differs on ${r.name}`);
      svar(trip[0]! - (last ? last[0]! : 0));
      for (let i = 1; i < trip.length; i++) {
        const hop = trip[i]! - trip[i - 1]!;
        svar(hop - (last ? last[i]! - last[i - 1]! : 0));
      }
      last = trip;
    }
  }

  const byStop: { to: number; seconds: number }[][] = tt.stops.map(() => []);
  for (const t of tt.transfers) byStop[t.from]!.push({ to: t.to, seconds: t.seconds });
  for (const [s, list] of byStop.entries()) {
    list.sort((a, b) => a.to - b.to);
    uvar(list.length);
    let prev = s;
    for (const [i, t] of list.entries()) {
      if (i === 0) svar(t.to - s);
      else uvar(t.to - prev);
      prev = t.to;
    }
    for (const t of list) uvar(t.seconds);
  }
  return Uint8Array.from(out);
}

export function decodeTimetable(data: ArrayBuffer | Uint8Array): TimetableData {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const magic = (buf[0]! | (buf[1]! << 8) | (buf[2]! << 16) | (buf[3]! << 24)) >>> 0;
  if (magic !== MAGIC) throw new Error('Not a timetable file');
  if (buf[4] !== 1) throw new Error(`Unsupported timetable version ${buf[4]}`);
  let p = 5;
  const n = buf.length;
  const uvar = (): number => {
    let v = 0;
    let mul = 1;
    for (;;) {
      if (p >= n) throw new Error('Timetable file is truncated');
      const b = buf[p++]!;
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
  };
  const svar = (): number => {
    const u = uvar();
    return u % 2 ? -(u + 1) / 2 : u / 2;
  };
  const dec = new TextDecoder();
  const text = () => {
    const len = uvar();
    if (p + len > n) throw new Error('Timetable file is truncated');
    const s = dec.decode(buf.subarray(p, p + len));
    p += len;
    return s;
  };

  const head = JSON.parse(text()) as Omit<TimetableData, 'stops' | 'routes' | 'transfers'>;
  const strings: string[] = new Array(uvar());
  for (let i = 0; i < strings.length; i++) strings[i] = text();
  const name = () => {
    const i = uvar();
    if (i >= strings.length) throw new Error('Timetable file is inconsistent');
    return strings[i]!;
  };

  const stops: TimetableData['stops'] = new Array(uvar());
  let px = 0;
  let py = 0;
  for (let i = 0; i < stops.length; i++) {
    px += svar();
    py += svar();
    const s: TimetableData['stops'][number] = {
      id: '',
      name: name(),
      lat: py / COORD_SCALE,
      lon: px / COORD_SCALE,
    };
    if (uvar() & 1) s.stepFree = false;
    const parent = uvar();
    if (parent) s.parent = parent - 1;
    stops[i] = s;
  }

  const routes: TimetableData['routes'] = new Array(uvar());
  for (let r = 0; r < routes.length; r++) {
    const routeName = name();
    const mode = MODES[uvar()] ?? 'other';
    const flags = uvar();
    const k = uvar();
    const rs = new Array<number>(k);
    let prev = 0;
    for (let i = 0; i < k; i++) rs[i] = prev += svar();
    const trips = new Array<number[]>(uvar());
    let last: number[] | null = null;
    for (let t = 0; t < trips.length; t++) {
      const trip = new Array<number>(k);
      trip[0] = svar() + (last ? last[0]! : 0);
      for (let i = 1; i < k; i++)
        trip[i] = trip[i - 1]! + svar() + (last ? last[i]! - last[i - 1]! : 0);
      trips[t] = last = trip;
    }
    routes[r] = { name: routeName, mode, stops: rs, trips };
    if (flags & 1) routes[r]!.stepFree = false;
  }

  const transfers: TimetableData['transfers'] = [];
  for (let s = 0; s < stops.length; s++) {
    const count = uvar();
    if (!count) continue;
    const start = transfers.length;
    let to = s;
    for (let i = 0; i < count; i++) {
      to = i === 0 ? s + svar() : to + uvar();
      transfers.push({ from: s, to, seconds: 0 });
    }
    for (let i = 0; i < count; i++) transfers[start + i]!.seconds = uvar();
  }
  if (p !== n) throw new Error('Timetable file is inconsistent');
  return { ...head, stops, routes, transfers };
}
