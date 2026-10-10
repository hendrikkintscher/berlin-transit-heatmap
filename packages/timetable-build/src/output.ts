import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { BuildResult } from './build.ts';

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

/** Writes timetable-day.json, timetable-night.json, stops.json and build-info.json. */
export function writeOutputs(result: BuildResult, outDir: string, extra: object = {}): BuildInfo {
  mkdirSync(outDir, { recursive: true });
  const files: Record<string, FileInfo> = {};
  const write = (name: string, value: unknown) => {
    const data = Buffer.from(JSON.stringify(value));
    writeFileSync(join(outDir, name), data);
    files[name] = { bytes: data.length, gzipBytes: gzipSync(data, { level: 9 }).length };
  };
  write('timetable-day.json', result.timetables.day);
  write('timetable-night.json', result.timetables.night);
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
