// Favourite places: a list kept in the browser, each with a weight, and a score for the
// current start point (the weighted average trip time to them). Imports read Google
// Takeout exports (Saved Places GeoJSON, saved-list CSV) and this app's own JSON export.

export type Weight = 1 | 2 | 3;
export const WEIGHTS: readonly Weight[] = [3, 2, 1];

export interface Favourite {
  id: string;
  label: string;
  lat: number;
  lon: number;
  /** 3 = important (e.g. work), 2 = normal, 1 = now and then. */
  weight: Weight;
}

/** A place read from an import file; without coordinates it still needs geocoding by name. */
export interface ImportedPlace {
  label: string;
  lat?: number;
  lon?: number;
  /** Extra text that helps geocoding (an address), if the file has one. */
  query?: string;
}

/** Trips that are unreachable in the window count as this long in the score. */
export const UNREACHABLE_MIN = 120;
const STORE_KEY = 'favourites';

export function loadFavourites(): Favourite[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter(isFavourite) : [];
  } catch {
    return [];
  }
}

export function saveFavourites(list: Favourite[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the list lasts for this visit only.
  }
}

function isFavourite(f: unknown): f is Favourite {
  const x = f as Favourite;
  return (
    !!x &&
    typeof x.label === 'string' &&
    Number.isFinite(x.lat) &&
    Number.isFinite(x.lon) &&
    WEIGHTS.includes(x.weight)
  );
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * "Where can I live?": per cell, the weighted average of the times to each favourite
 * (`seconds[i]` is the grid of times to place i), unreachable counting as UNREACHABLE_MIN,
 * as in `score`.
 */
export function scoreGrid(
  seconds: readonly Float32Array[],
  weights: readonly number[],
): Float32Array {
  const out = new Float32Array(seconds[0]?.length ?? 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return out.fill(Infinity);
  seconds.forEach((g, i) => {
    const w = weights[i] / total;
    for (let k = 0; k < out.length; k++)
      out[k] += w * (g[k] < Infinity ? g[k] : UNREACHABLE_MIN * 60);
  });
  return out;
}

/**
 * Minutes from the start point to each favourite (null = unreachable) and their weighted
 * average, unreachable trips counting as UNREACHABLE_MIN. `secondsAt` reads the travel-time grid.
 */
export function score(
  list: readonly Favourite[],
  secondsAt: (lat: number, lon: number) => number,
): { minutes: (number | null)[]; average: number | null } {
  const minutes = list.map((f) => {
    const s = secondsAt(f.lat, f.lon);
    return Number.isFinite(s) ? Math.round(s / 60) : null;
  });
  let sum = 0;
  let weights = 0;
  list.forEach((f, i) => {
    sum += f.weight * (minutes[i] ?? UNREACHABLE_MIN);
    weights += f.weight;
  });
  return { minutes, average: weights ? Math.round(sum / weights) : null };
}

/** Reads an import file: GeoJSON (Takeout "Saved Places"), CSV (Takeout lists) or our JSON. */
export function parseImport(text: string): ImportedPlace[] {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJson(JSON.parse(trimmed));
  return parseCsv(trimmed);
}

function parseJson(data: unknown): ImportedPlace[] {
  // Our own export: a plain array of favourites.
  if (Array.isArray(data)) {
    return data.filter(isFavourite).map((f) => ({ label: f.label, lat: f.lat, lon: f.lon }));
  }
  const fc = data as {
    features?: {
      geometry?: { coordinates?: number[] };
      properties?: {
        name?: string;
        Title?: string;
        location?: { name?: string; address?: string };
      };
    }[];
  };
  return (fc.features ?? []).flatMap((f) => {
    const p = f.properties ?? {};
    const label = p.location?.name ?? p.name ?? p.Title ?? p.location?.address;
    if (!label) return [];
    const [lon, lat] = f.geometry?.coordinates ?? [];
    // Takeout writes [0, 0] when it has no position; those need geocoding.
    const has = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
    return [
      {
        label,
        ...(has ? { lat, lon } : {}),
        query: p.location?.address ?? label,
      },
    ];
  });
}

function parseCsv(text: string): ImportedPlace[] {
  const rows = csvRows(text);
  const header = rows.findIndex((r) => r.some((c) => /^(title|titel|name)$/i.test(c.trim())));
  if (header < 0) return [];
  const cols = rows[header].map((c) => c.trim().toLowerCase());
  const title = cols.findIndex((c) => ['title', 'titel', 'name'].includes(c));
  const url = cols.findIndex((c) => c === 'url');
  return rows.slice(header + 1).flatMap((r) => {
    const label = r[title]?.trim();
    if (!label) return [];
    const at = url >= 0 ? coordsFromMapsUrl(r[url] ?? '') : null;
    return [{ label, ...(at ?? {}), query: label }];
  });
}

/** Google Maps links sometimes carry the position (dropped pins, "@lat,lon", "!3dlat!4dlon"). */
export function coordsFromMapsUrl(url: string): { lat: number; lon: number } | null {
  const m =
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url) ??
    /[/@](-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(decodeURIComponent(url)) ??
    /[?&](?:q|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(decodeURIComponent(url));
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}
