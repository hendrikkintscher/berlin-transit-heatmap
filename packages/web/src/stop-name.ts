// Stop names for display, shared by the app and the worker.
import { REGION } from '@berlin-transit-heatmap/routing';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOWN_END = new RegExp(`\\s*\\(${esc(REGION.town)}\\)$`);
const TOWN_START = new RegExp(`^${esc(REGION.town)},\\s*`);

/** The feed's names carry the town: "U Hermannplatz (Berlin)", "Berlin, Greifswalder Str." */
export const stopName = (n: string) => n.replace(TOWN_END, '').replace(TOWN_START, '');

/** "S+U Alexanderplatz Bhf (Berlin)" -> "S+U Alexanderplatz Bhf"; drops "[...]" notes too. */
export const stationName = (n: string) => stopName(n.replace(/\s*\[[^\]]*\]/g, '')).trim() || n;
