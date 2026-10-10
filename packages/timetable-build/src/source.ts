import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';

/** Read access to the files of a GTFS feed, either a .zip or an extracted directory. */
export interface GtfsSource {
  has(name: string): boolean;
  open(name: string): Promise<Readable>;
  /** Last-modified date (YYYY-MM-DD) of stops.txt, used as a fallback feed version. */
  modifiedDate(): string;
  close(): void;
}

export async function openGtfs(path: string): Promise<GtfsSource> {
  return statSync(path).isDirectory() ? openDirectory(path) : openZip(path);
}

function openDirectory(dir: string): GtfsSource {
  return {
    has: (name) => existsSync(join(dir, name)),
    open: async (name) => createReadStream(join(dir, name)),
    modifiedDate: () => statSync(join(dir, 'stops.txt')).mtime.toISOString().slice(0, 10),
    close: () => {},
  };
}

async function openZip(path: string): Promise<GtfsSource> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, z) =>
      err ? reject(err) : resolve(z),
    ),
  );
  const entries = new Map<string, yauzl.Entry>();
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      // Some feeds nest the files in a folder; key by base name.
      entries.set(entry.fileName.replace(/^.*\//, ''), entry);
      zip.readEntry();
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });
  return {
    has: (name) => entries.has(name),
    open: (name) => {
      const entry = entries.get(name);
      if (!entry) return Promise.reject(new Error(`${name} not found in ${path}`));
      return new Promise((resolve, reject) =>
        zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))),
      );
    },
    modifiedDate: () => {
      const entry = entries.get('stops.txt');
      return (entry ? entry.getLastModDate() : new Date()).toISOString().slice(0, 10);
    },
    close: () => zip.close(),
  };
}
