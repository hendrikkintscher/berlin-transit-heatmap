/**
 * Contract 4: the timetable as compact binary files, the same content as the JSON file
 * (Contract 1) without the GTFS stop ids, at about a third of the gzipped size and much
 * quicker to read. Since version 3 a build writes the stops and their footpaths once, in
 * `stoplist.bin`, and each `timetable-<window>.bin` holds only that hour's routes: the stop
 * list is most of a self-contained file and the same in every hour.
 *
 * Little-endian: u32 magic, u8 version, then unsigned LEB128 varints (svar: zig-zag signed):
 * - the header: byte length, then UTF-8 JSON;
 * - a string table: count, then per string its UTF-8 byte length and bytes.
 *
 * The stop list (magic "BTHS", version 1): the header has version, id and feedVersion; the
 * strings are the stop names; then
 * - stops: count; per stop svar lon and lat in 1e-5 degrees from the previous stop,
 *   the name's string index, flags (bit 0: not step-free) and parent + 1 (0: none);
 * - transfers: per stop the count, then the targets in ascending order (svar from the
 *   stop for the first, gaps after), then the seconds.
 * Its id is a hash of everything after the header.
 *
 * A timetable (magic "BTHT"): the header has version, window, serviceDate, windowStart,
 * windowEnd and feedVersion; version 3 also stopList (the stop list's id) and stopCount.
 * Version 3 has the route names as strings, then the routes; versions 1 and 2 (1: no
 * dwells) are self-contained: all names as strings, the stops, the routes, the transfers.
 * - routes: count; per route the name's string index, mode index (MODES), flags
 *   (bit 0: not step-free, bit 1: has dwells), stop count, svar stop index deltas, trip
 *   count, then per trip svar its first time minus the previous trip's, per hop svar
 *   the hop time minus the previous trip's hop time and, with dwells, per stop svar
 *   the dwell minus the previous trip's dwell there.
 *
 * This file imports nothing, so timetable-build can use the encoder directly.
 */

const MAGIC = 0x54485442;
const STOP_LIST_MAGIC = 0x53485442;
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
    dwells?: number[][];
    stepFree?: false;
  }[];
  transfers: { from: number; to: number; seconds: number }[];
}

/** A build's stops and footpaths (`stoplist.bin`), shared by all its hourly timetables. */
export interface StopListData {
  /** Named by every timetable built with it. */
  id: string;
  feedVersion: string;
  stops: TimetableData['stops'];
  transfers: TimetableData['transfers'];
}

function writer() {
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
  const strings: string[] = [];
  const index = new Map<string, number>();
  /** A string's index in the table, adding it if new. */
  const str = (s: string) => {
    let i = index.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      index.set(s, i);
    }
    return i;
  };
  const table = () => {
    uvar(strings.length);
    for (const s of strings) bytes(enc.encode(s));
  };
  const json = (v: unknown) => bytes(enc.encode(JSON.stringify(v)));
  return { out, uvar, svar, str, table, json };
}

type Writer = ReturnType<typeof writer>;

function writeStops(w: Writer, stops: TimetableData['stops']) {
  w.uvar(stops.length);
  let px = 0;
  let py = 0;
  for (const s of stops) {
    const x = Math.round(s.lon * COORD_SCALE);
    const y = Math.round(s.lat * COORD_SCALE);
    w.svar(x - px);
    w.svar(y - py);
    px = x;
    py = y;
    w.uvar(w.str(s.name));
    w.uvar(s.stepFree === false ? 1 : 0);
    w.uvar(s.parent === undefined ? 0 : s.parent + 1);
  }
}

function writeTransfers(w: Writer, stopCount: number, transfers: TimetableData['transfers']) {
  const byStop: { to: number; seconds: number }[][] = Array.from({ length: stopCount }, () => []);
  for (const t of transfers) byStop[t.from]!.push({ to: t.to, seconds: t.seconds });
  for (const [s, list] of byStop.entries()) {
    list.sort((a, b) => a.to - b.to);
    w.uvar(list.length);
    let prev = s;
    for (const [i, t] of list.entries()) {
      if (i === 0) w.svar(t.to - s);
      else w.uvar(t.to - prev);
      prev = t.to;
    }
    for (const t of list) w.uvar(t.seconds);
  }
}

function writeRoutes(w: Writer, routes: TimetableData['routes']) {
  w.uvar(routes.length);
  for (const r of routes) {
    w.uvar(w.str(r.name));
    const m = MODES.indexOf(r.mode);
    w.uvar(m < 0 ? MODES.length - 1 : m);
    const dwells = r.dwells?.some((d) => d.some((x) => x !== 0)) ? r.dwells : undefined;
    w.uvar((r.stepFree === false ? 1 : 0) | (dwells ? 2 : 0));
    w.uvar(r.stops.length);
    let prev = 0;
    for (const s of r.stops) {
      w.svar(s - prev);
      prev = s;
    }
    w.uvar(r.trips.length);
    let last: number[] | null = null;
    let lastDwell: number[] | null = null;
    for (const [t, trip] of r.trips.entries()) {
      if (trip.length !== r.stops.length) throw new Error(`Trip length differs on ${r.name}`);
      w.svar(trip[0]! - (last ? last[0]! : 0));
      for (let i = 1; i < trip.length; i++) {
        const hop = trip[i]! - trip[i - 1]!;
        w.svar(hop - (last ? last[i]! - last[i - 1]! : 0));
      }
      last = trip;
      if (dwells) {
        const d = dwells[t]!;
        if (d.length !== trip.length) throw new Error(`Dwell length differs on ${r.name}`);
        for (let i = 0; i < d.length; i++) w.svar(d[i]! - (lastDwell ? lastDwell[i]! : 0));
        lastDwell = d;
      }
    }
  }
}

/** Two writers' output joined: the header part, then the body. */
function joined(head: number[], body: number[]): Uint8Array {
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
}

/** FNV-1a over the bytes, as 8 hex digits. */
function hash(bytes: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The stop list file for a build's stops and footpaths, and its id. */
export function encodeStopList(tt: Pick<TimetableData, 'feedVersion' | 'stops' | 'transfers'>): {
  data: Uint8Array;
  id: string;
} {
  const body = writer();
  // The names first (the string table comes before the stops that use it).
  for (const s of tt.stops) body.str(s.name);
  body.table();
  writeStops(body, tt.stops);
  writeTransfers(body, tt.stops.length, tt.transfers);
  const id = hash(body.out);
  const head = writer();
  head.out.push(0x42, 0x54, 0x48, 0x53, 1);
  head.json({ version: 1, id, feedVersion: tt.feedVersion });
  return { data: joined(head.out, body.out), id };
}

/**
 * The timetable file. With `stopList` (the id encodeStopList gave for the same stops and
 * footpaths) it holds only the routes (version 3); without, everything (version 2).
 */
export function encodeTimetable(tt: TimetableData, stopList?: string): Uint8Array {
  const w = writer();
  const { version, window, serviceDate, windowStart, windowEnd, feedVersion } = tt;
  const head = { version, window, serviceDate, windowStart, windowEnd, feedVersion };
  if (stopList !== undefined) {
    w.out.push(0x42, 0x54, 0x48, 0x54, 3);
    w.json({ ...head, stopList, stopCount: tt.stops.length });
    const body = writer();
    for (const r of tt.routes) body.str(r.name);
    body.table();
    writeRoutes(body, tt.routes);
    return joined(w.out, body.out);
  }
  w.out.push(0x42, 0x54, 0x48, 0x54, 2);
  w.json(head);
  const body = writer();
  for (const s of tt.stops) body.str(s.name);
  for (const r of tt.routes) body.str(r.name);
  body.table();
  writeStops(body, tt.stops);
  writeRoutes(body, tt.routes);
  writeTransfers(body, tt.stops.length, tt.transfers);
  return joined(w.out, body.out);
}

function reader(data: ArrayBuffer | Uint8Array, magic: number, what: string) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const m = (buf[0]! | (buf[1]! << 8) | (buf[2]! << 16) | (buf[3]! << 24)) >>> 0;
  if (m !== magic) throw new Error(`Not a ${what} file`);
  let p = 5;
  const n = buf.length;
  const uvar = (): number => {
    let v = 0;
    let mul = 1;
    for (;;) {
      if (p >= n) throw new Error(`The ${what} file is truncated`);
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
    if (p + len > n) throw new Error(`The ${what} file is truncated`);
    const s = dec.decode(buf.subarray(p, p + len));
    p += len;
    return s;
  };
  let strings: string[] = [];
  const table = () => {
    strings = new Array<string>(uvar());
    for (let i = 0; i < strings.length; i++) strings[i] = text();
  };
  const name = () => {
    const i = uvar();
    if (i >= strings.length) throw new Error(`The ${what} file is inconsistent`);
    return strings[i]!;
  };
  const end = () => {
    if (p !== n) throw new Error(`The ${what} file is inconsistent`);
  };
  return { version: buf[4], uvar, svar, text, table, name, end };
}

type Reader = ReturnType<typeof reader>;

function readStops(r: Reader): TimetableData['stops'] {
  const stops: TimetableData['stops'] = new Array(r.uvar());
  let px = 0;
  let py = 0;
  for (let i = 0; i < stops.length; i++) {
    px += r.svar();
    py += r.svar();
    const s: TimetableData['stops'][number] = {
      id: '',
      name: r.name(),
      lat: py / COORD_SCALE,
      lon: px / COORD_SCALE,
    };
    if (r.uvar() & 1) s.stepFree = false;
    const parent = r.uvar();
    if (parent > stops.length) throw new Error('Timetable file is inconsistent');
    if (parent) s.parent = parent - 1;
    stops[i] = s;
  }
  return stops;
}

function readTransfers(r: Reader, stopCount: number): TimetableData['transfers'] {
  const transfers: TimetableData['transfers'] = [];
  for (let s = 0; s < stopCount; s++) {
    const count = r.uvar();
    if (!count) continue;
    const start = transfers.length;
    let to = s;
    for (let i = 0; i < count; i++) {
      to = i === 0 ? s + r.svar() : to + r.uvar();
      transfers.push({ from: s, to, seconds: 0 });
    }
    for (let i = 0; i < count; i++) transfers[start + i]!.seconds = r.uvar();
  }
  return transfers;
}

function readRoutes(r: Reader): TimetableData['routes'] {
  const routes: TimetableData['routes'] = new Array(r.uvar());
  for (let ri = 0; ri < routes.length; ri++) {
    const routeName = r.name();
    const mode = MODES[r.uvar()] ?? 'other';
    const flags = r.uvar();
    const k = r.uvar();
    const rs = new Array<number>(k);
    let prev = 0;
    for (let i = 0; i < k; i++) rs[i] = prev += r.svar();
    const trips = new Array<number[]>(r.uvar());
    const dwells = flags & 2 ? new Array<number[]>(trips.length) : undefined;
    let last: number[] | null = null;
    let lastDwell: number[] | null = null;
    for (let t = 0; t < trips.length; t++) {
      const trip = new Array<number>(k);
      trip[0] = r.svar() + (last ? last[0]! : 0);
      for (let i = 1; i < k; i++)
        trip[i] = trip[i - 1]! + r.svar() + (last ? last[i]! - last[i - 1]! : 0);
      trips[t] = last = trip;
      if (dwells) {
        const d = new Array<number>(k);
        for (let i = 0; i < k; i++) d[i] = r.svar() + (lastDwell ? lastDwell[i]! : 0);
        dwells[t] = lastDwell = d;
      }
    }
    routes[ri] = { name: routeName, mode, stops: rs, trips, ...(dwells ? { dwells } : {}) };
    if (flags & 1) routes[ri]!.stepFree = false;
  }
  return routes;
}

export function decodeStopList(data: ArrayBuffer | Uint8Array): StopListData {
  const r = reader(data, STOP_LIST_MAGIC, 'stop list');
  if (r.version !== 1) throw new Error(`Unsupported stop list version ${r.version}`);
  const head = JSON.parse(r.text()) as { id: string; feedVersion: string };
  r.table();
  const stops = readStops(r);
  const transfers = readTransfers(r, stops.length);
  r.end();
  return { id: head.id, feedVersion: head.feedVersion, stops, transfers };
}

/** Whether a timetable file holds only its routes, so decodeTimetable needs its stop list. */
export function needsStopList(data: ArrayBuffer | Uint8Array): boolean {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  return buf[4] === 3;
}

/**
 * Reads a timetable file; one holding only its routes (needsStopList) takes the stop list
 * it was built with, whose stops and footpaths it then shares.
 */
export function decodeTimetable(
  data: ArrayBuffer | Uint8Array,
  stopList?: StopListData,
): TimetableData {
  const r = reader(data, MAGIC, 'timetable');
  if (r.version !== 1 && r.version !== 2 && r.version !== 3)
    throw new Error(`Unsupported timetable version ${r.version}`);
  const {
    stopList: listId,
    stopCount,
    ...head
  } = JSON.parse(r.text()) as Omit<TimetableData, 'stops' | 'routes' | 'transfers'> & {
    stopList?: string;
    stopCount?: number;
  };
  r.table();
  if (r.version === 3) {
    if (!stopList) throw new Error('This timetable file needs its stop list');
    if (stopList.id !== listId || stopList.stops.length !== stopCount)
      throw new Error('The timetable and the stop list are from different builds');
    const routes = readRoutes(r);
    r.end();
    return { ...head, stops: stopList.stops, routes, transfers: stopList.transfers };
  }
  const stops = readStops(r);
  const routes = readRoutes(r);
  const transfers = readTransfers(r, stops.length);
  r.end();
  return { ...head, stops, routes, transfers };
}
