// The region this app serves (Berlin, the only one for now; routing/src/regions.ts): where
// its data lives and how what the phone stores is kept apart per region.
import { REGION } from '@berlin-transit-heatmap/routing';

export const region = REGION;

/** The region's data folder: timetables, footpaths, lines, changes and stop ids. */
export const dataBase = (): string => new URL(`data/${region.id}/`, document.baseURI).href;

/**
 * The storage key of something kept per region ("berlin:favourites"). Lists saved before
 * regions existed were Berlin's: the first read moves them over.
 */
export function regionKey(name: string, storage: Storage = localStorage): string {
  const key = `${region.id}:${name}`;
  try {
    if (region.id === 'berlin' && storage.getItem(key) === null) {
      const old = storage.getItem(name);
      if (old !== null) storage.setItem(key, old);
    }
  } catch {
    // Storage blocked: nothing to move.
  }
  return key;
}
