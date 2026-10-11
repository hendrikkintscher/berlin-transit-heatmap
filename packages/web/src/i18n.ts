// Interface text in German (default) and English. Static text in index.html carries
// data-t* attributes naming its key; dynamic text is built with t() and the helpers below.

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];

const de = {
  title: 'Berlin in Minuten',
  description: 'Wie lange brauchst du mit Bus und Bahn von einem Punkt in Berlin überallhin?',
  mapLabel: 'Karte von Berlin',
  timeWindow: 'Zeitfenster',
  day: 'Tag',
  night: 'Nacht',
  lines: 'Linien',
  linesHint: 'Die Verbindungen, über die du von deinem Start am schnellsten fährst',
  searchOpen: 'Adresse suchen',
  searchPlaceholder: 'Straße, Ort oder Haltestelle',
  searchField: 'Adresse',
  searchClose: 'Suche schließen',
  menuOpen: 'Menü',
  menuClose: 'Menü schließen',
  menuMap: 'Karte',
  menuLanguage: 'Sprache',
  about: 'Über diese Karte',
  hint: 'Tippe auf die Karte oder suche einen Startpunkt',
  startHere: 'Hier starten',
  legend: 'Legende Reisezeit in Minuten',
  close: 'Schließen',
  aboutHow:
    'Tippe irgendwo auf die Karte oder suche eine Adresse, um einen Startpunkt zu setzen. Die Farben zeigen die kürzeste Fahrt mit Bus und Bahn zu jedem Ort, inklusive Fußwegen zu und von den Haltestellen: 5-Minuten-Stufen bis 20 Minuten, 2½-Minuten-Stufen von 20 bis 50 Minuten und breitere Stufen darüber.',
  aboutLines:
    '<b>Linien</b> zeigt die Abschnitte von S-Bahn, U-Bahn, Tram und Bus, auf die die schnellsten Fahrten von deinem Startpunkt angewiesen sind. Je dicker die Linie, desto mehr der Karte erreichst du darüber. Tippe auf eine Linie, um ihren Namen zu sehen.',
  aboutWindows:
    '<b>Tag</b> nutzt Abfahrten zwischen 10 und 12 Uhr an einem Werktag. <b>Nacht</b> nutzt Abfahrten zwischen 2 und 4 Uhr in der folgenden Nacht.',
  aboutArea: 'Die Karte deckt Berlin und den nahen Rand ab; die Suche schlägt nur Orte darin vor.',
  credits:
    'Fahrplandaten: <a href="https://www.vbb.de/vbb-services/api-open-data/datensaetze/" target="_blank" rel="noopener">VBB Open Data</a> (CC BY 4.0). Karte: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende. Adresssuche: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> von Komoot.',
  feedLoading: 'Fahrplan wird geladen…',
  feedInfo: 'Fahrplan des VBB, Verkehrstag {date} (Datensatz {version}, {stops} Haltestellen).',
  computing: 'Wird berechnet…',
  computed: 'Berechnet in {s} s · tippe auf die Karte für Minuten',
  failed: 'Etwas ist schiefgelaufen: {message}',
  minutes: '<b>{n} Min.</b> {when}',
  byDay: 'tagsüber',
  atNight: 'nachts',
  unreachable: 'Im Zeitfenster nicht erreichbar',
  lineShare: '<b>{names}</b> · schnellster Weg zu {pct} % der Karte',
  noMatches: 'Keine Treffer im Kartengebiet',
  searchDown: 'Die Suche ist gerade nicht erreichbar',
  searchOffline: 'Die Suche braucht eine Internetverbindung',
  legendMax: '120+ min',
};
export type Key = keyof typeof de;

const en: Record<Key, string> = {
  title: 'Berlin in Minutes',
  description: 'How long does public transport take from any point in Berlin to everywhere else?',
  mapLabel: 'Map of Berlin',
  timeWindow: 'Time window',
  day: 'Day',
  night: 'Night',
  lines: 'Lines',
  linesHint: 'The connections your fastest trips from the start point rely on',
  searchOpen: 'Search for an address',
  searchPlaceholder: 'Street, place or station',
  searchField: 'Address',
  searchClose: 'Close search',
  menuOpen: 'Menu',
  menuClose: 'Close menu',
  menuMap: 'Map',
  menuLanguage: 'Language',
  about: 'About this map',
  hint: 'Tap the map or search to choose a start',
  startHere: 'Start here',
  legend: 'Travel time legend, minutes',
  close: 'Close',
  aboutHow:
    'Tap anywhere or search for an address to set a start point. Colours show the shortest public-transport trip to each spot, including walking to and from stops: 5-minute bands up to 20 minutes, 2½-minute bands from 20 to 50 minutes, and wider bands beyond.',
  aboutLines:
    '<b>Lines</b> shows the stretches of S-Bahn, U-Bahn, tram and bus that the fastest trips from your start point rely on. The thicker the line, the more of the map is reached over it. Tap a line to see its name.',
  aboutWindows:
    '<b>Day</b> uses departures between 10:00 and 12:00 on a weekday. <b>Night</b> uses departures between 02:00 and 04:00 the following night.',
  aboutArea:
    'The map covers Berlin and its immediate surroundings; search only suggests places inside it.',
  credits:
    'Timetable data: <a href="https://www.vbb.de/vbb-services/api-open-data/datensaetze/" target="_blank" rel="noopener">VBB open data</a> (CC BY 4.0). Map: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors. Address search: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> by Komoot.',
  feedLoading: 'Loading timetable…',
  feedInfo: 'Timetable from VBB, service day {date} (feed {version}, {stops} stops).',
  computing: 'Computing…',
  computed: 'Computed in {s} s · tap the map for minutes',
  failed: 'Something went wrong: {message}',
  minutes: '<b>{n} min</b> {when}',
  byDay: 'by day',
  atNight: 'at night',
  unreachable: 'Not reachable within the time window',
  lineShare: '<b>{names}</b> · fastest way to {pct}% of the map',
  noMatches: 'No matches in the map area',
  searchDown: 'Search is not reachable right now',
  searchOffline: 'Search needs a connection',
  legendMax: '120+ min',
};

export const STRINGS: Record<Lang, Record<Key, string>> = { de, en };
const STORE_KEY = 'lang';

let current: Lang = 'de';
export const lang = () => current;

/** Looks up a string and fills {placeholders}. Values are inserted as given (escape HTML first). */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return STRINGS[current][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export const formatNumber = (n: number) => n.toLocaleString(current === 'de' ? 'de-DE' : 'en-GB');
export const formatDecimal = (n: number, digits: number) =>
  n.toLocaleString(current === 'de' ? 'de-DE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** URL parameter first (?lang=en), then the saved choice, then German. */
export function initialLang(search: string, stored: string | null): Lang {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  return isLang(stored) ? stored : 'de';
}

export function readStoredLang(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

/** Switches the language, remembers it and rewrites every data-t* element in the page. */
export function setLang(l: Lang, remember = true) {
  current = l;
  if (remember) {
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
  }
  document.documentElement.lang = l;
  document.title = t('title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'));
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]'))
    el.textContent = t(el.dataset.t as Key);
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-html]'))
    el.innerHTML = t(el.dataset.tHtml as Key);
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-label]'))
    el.setAttribute('aria-label', t(el.dataset.tLabel as Key));
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-title]'))
    el.title = t(el.dataset.tTitle as Key);
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-t-placeholder]'))
    el.placeholder = t(el.dataset.tPlaceholder as Key);
}
