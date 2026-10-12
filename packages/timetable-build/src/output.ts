import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { BuildResult } from './build.ts';
import type { ChangesFile } from './changes.ts';
// The binary format (Contract 4) lives with its decoder; that file imports nothing.
import { encodeTimetable } from '../../routing/src/ttbin.ts';
import { encodeLines } from '../../routing/src/linesbin.ts';

export interface FileInfo {
  bytes: number;
  gzipBytes: number;
}

export interface BuildInfo {
  version: 1;
  builtAt: string;
  serviceDate: string;
  feedVersion: string;
  stats: BuildResult['stats'];
  files: Record<string, FileInfo>;
}

/**
 * Writes timetable-<window>.bin (Contract 4, what the app loads) for every window,
 * stops.json, stop-ids.json, lines.bin, changes.json (with real dates) and build-info.json.
 * (The JSON timetables are gone: the app reads only the binary ones.)
 */
export function writeOutputs(result: BuildResult, outDir: string, extra: object = {}): BuildInfo {
  mkdirSync(outDir, { recursive: true });
  const files: Record<string, FileInfo> = {};
  const save = (name: string, data: Uint8Array) => {
    writeFileSync(join(outDir, name), data);
    files[name] = { bytes: data.length, gzipBytes: gzipSync(data, { level: 9 }).length };
  };
  const write = (name: string, value: unknown) => save(name, Buffer.from(JSON.stringify(value)));
  for (const [name, tt] of Object.entries(result.timetables))
    save(`timetable-${name}.bin`, encodeTimetable(tt));
  write('stops.json', result.stopsFile);
  // The binary timetables carry no GTFS ids; the app's live status (web live.ts) looks up
  // a stop's VBB station number here, by stop index: 900100003 for Alexanderplatz, 0 if none.
  write('stop-ids.json', {
    version: 1,
    feedVersion: result.stats.feedVersion,
    ids: result.stopsFile.stops.map((s) => Number(/^de:\d+:(\d{9})/.exec(s.id)?.[1] ?? 0)),
  });
  // The hops' courses along tracks and roads (linesbin.ts), loaded by the app after the map.
  if (result.lines) {
    const stops = result.stopsFile.stops;
    save(
      'lines.bin',
      encodeLines(result.lines, (s) => [stops[s]!.lon, stops[s]!.lat]),
    );
  }
  if (result.changes) {
    const changes: ChangesFile = {
      version: 1,
      feedVersion: result.stats.feedVersion,
      days: result.changes,
    };
    write('changes.json', changes);
  }
  const info: BuildInfo = {
    version: 1,
    builtAt: new Date().toISOString(),
    serviceDate: result.stats.serviceDate,
    feedVersion: result.stats.feedVersion,
    stats: result.stats,
    files,
    ...extra,
  };
  writeFileSync(join(outDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}
