import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { isDatedWindow, type BuildResult } from './build.ts';
// The binary format (Contract 4) lives with its decoder; that file imports nothing.
import { encodeTimetable } from '../../routing/src/ttbin.ts';

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
 * Writes timetable-<window>.bin (Contract 4, what the app loads) for every window, the
 * same as timetable-<window>.json for the reference-day windows (the real dates only get
 * the binary: there are many of them), stops.json and build-info.json.
 */
export function writeOutputs(result: BuildResult, outDir: string, extra: object = {}): BuildInfo {
  mkdirSync(outDir, { recursive: true });
  const files: Record<string, FileInfo> = {};
  const save = (name: string, data: Uint8Array) => {
    writeFileSync(join(outDir, name), data);
    files[name] = { bytes: data.length, gzipBytes: gzipSync(data, { level: 9 }).length };
  };
  const write = (name: string, value: unknown) => save(name, Buffer.from(JSON.stringify(value)));
  for (const [name, tt] of Object.entries(result.timetables)) {
    if (!isDatedWindow(name)) write(`timetable-${name}.json`, tt);
    save(`timetable-${name}.bin`, encodeTimetable(tt));
  }
  write('stops.json', result.stopsFile);
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
