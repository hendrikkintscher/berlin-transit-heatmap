// Interface text in German (default) and English. Static text in index.html carries
// data-t* attributes naming its key; dynamic text is built with t() and the helpers below.

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];

const de = {
  title: 'Berlin in Minuten',
  description: 'Wie lange brauchst du mit Bus und Bahn von einem Punkt in Berlin überallhin?',
  mapLabel: 'Karte von Berlin',
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
    'Oben wählst du die <b>Abfahrtszeit</b>: Werktag oder Wochenende und die Stunde, in der du losfährst. Die Karte zeigt die schnellste Fahrt mit Abfahrt in dieser Stunde.',
  aboutArea: 'Die Karte deckt Berlin und den nahen Rand ab; die Suche schlägt nur Orte darin vor.',
  credits:
    'Fahrplandaten: <a href="https://www.vbb.de/vbb-services/api-open-data/datensaetze/" target="_blank" rel="noopener">VBB Open Data</a> (CC BY 4.0). Karte: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende. Adresssuche: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> von Komoot.',
  feedLoading: 'Fahrplan wird geladen…',
  feedInfo: 'Fahrplan des VBB, Verkehrstag {date} (Datensatz {version}, {stops} Haltestellen).',
  computing: 'Wird berechnet…',
  computed: 'Berechnet in {s} s · tippe auf die Karte für Minuten',
  failed: 'Etwas ist schiefgelaufen: {message}',
  minutes: '<b>{n} Min.</b> {when}',
  unreachable: 'Im Zeitfenster nicht erreichbar',
  lineShare: '<b>{names}</b> · schnellster Weg zu {pct} % der Karte',
  noMatches: 'Keine Treffer im Kartengebiet',
  searchDown: 'Die Suche ist gerade nicht erreichbar',
  searchOffline: 'Die Suche braucht eine Internetverbindung',
  freq: 'Takt der Haltestellen',
  freqHint: 'Abfahrten pro Stunde, alle Linien und Richtungen zusammen',
  desert: 'ÖPNV-Wüsten',
  desertHint: 'Wo Fußweg zur Haltestelle plus Wartezeit über 10 Min. liegt (0 bis 5 Uhr: 20 Min.)',
  freqLegend: 'Abfahrten/h',
  desertLegend: 'Fußweg + Warten',
  min: 'Min.',
  stationFreq: '<b>{name}</b> · {n} Abfahrten/h',
  access: 'Fußweg + Warten bis zur Abfahrt: {n} Min.',
  accessNone: 'Keine Haltestelle in 15 Min. Fußweg',
  aboutLayers:
    '<b>Takt der Haltestellen</b> zeigt, wie oft im Zeitfenster abgefahren wird. <b>ÖPNV-Wüsten</b> schattiert Orte, an denen der Fußweg zur Haltestelle plus die durchschnittliche Wartezeit (halber Takt) über 10 und 15 Min. liegt, zwischen 0 und 5 Uhr über 20 und 30 Min.. Beide findest du im Menü.',
  minutesBoth: '<b><i class="p1"></i>{a} · <i class="p2"></i>{b} Min.</b> {when}',
  secondHere: '2. Start',
  favHere: '★ Merken',
  meet: 'Treffpunkt: Farben zeigen die längere der beiden Fahrten',
  meetClose: 'Zweiten Startpunkt entfernen',
  favTitle: 'Lieblingsorte',
  favEmpty:
    'Noch keine Orte. Füge Arbeit, Freunde oder Lieblingsbars hinzu: Mit Startpunkt siehst du die Fahrzeit zu jedem und einen Schnitt.',
  favAdd: '+ Ort suchen',
  favImport: 'Liste importieren',
  favExport: 'Exportieren',
  favHelp:
    'Import: Google Takeout (Maps „Gespeicherte Orte“ als .json oder Listen als .csv) oder eine exportierte Liste.',
  favWeight: 'Wichtigkeit',
  weight3: 'Wichtig',
  weight2: 'Normal',
  weight1: 'Ab und zu',
  favRemove: '{name} entfernen',
  favScore: '★ Ø {n} Min. zu {count} Lieblingsorten',
  favImporting: 'Importiere {i} von {n}…',
  favImported: '{n} Orte importiert, {missing} nicht gefunden.',
  favImportFailed: 'Die Datei konnte nicht gelesen werden.',
  aboutCompare:
    '<b>Treffpunkt:</b> Tippe nach dem Start auf einen zweiten Ort und wähle „2. Start“. Die Farben zeigen dann die längere der beiden Fahrten, also wo ihr beide in N Minuten sein könnt. <b>Lieblingsorte</b> (im Menü) zeigen für den Startpunkt die Fahrzeit zu jedem Ort und einen nach Wichtigkeit gewichteten Schnitt; nicht erreichbare Orte zählen mit 120 Min. Die Liste bleibt in deinem Browser.',
  whenOpen: 'Abfahrtszeit wählen',
  whenTitle: 'Abfahrt',
  whenDay: 'Tag',
  whenHour: 'Stunde der Abfahrt',
  weekday: 'Werktag',
  weekend: 'Wochenende',
  weekdayAt: 'Werktag {hour}',
  weekendAt: 'Wochenende {hour}',
  onWeekdays: 'werktags ab {hour}',
  onWeekends: 'am Wochenende ab {hour}',
  whenNote:
    'Zeigt die schnellsten Fahrten mit Abfahrt in der gewählten Stunde. Werktag ist ein Dienstag bis Donnerstag, Wochenende ein Samstag; 0 bis 4 Uhr am Wochenende ist die Nacht von Freitag auf Samstag.',
  locate: 'Mein Standort als Start',
  locating: 'Standort wird gesucht…',
  locateOutside: 'Dein Standort liegt außerhalb der Karte (Berlin und naher Rand).',
  locateDenied: 'Kein Zugriff auf den Standort. Erlaube ihn in den Browser-Einstellungen.',
  locateFailed: 'Standort nicht gefunden.',
  share: 'Link zu dieser Karte teilen',
  shareText: 'So weit kommst du von hier mit Bus und Bahn',
  linkCopied: 'Link kopiert',
  install: 'Als App installieren',
  installNow: 'Installieren',
  iso: 'Umrisse 15, 30, 45 Min.',
  isoHint: 'Linien, bis wohin du in 15, 30 und 45 Minuten kommst',
  opacity: 'Deckkraft der Farben',
  opacityHint: 'Weniger, um Straßennamen besser zu sehen',
  dataNote: 'Fahrplan vom {date}. Baustellen und Störungen sind nicht berücksichtigt.',
  aboutData:
    'Die Karte nutzt den regulären Fahrplan eines Werktags (Dienstag bis Donnerstag) und eines Samstags. Baustellen, Ersatzverkehr und Störungen an anderen Tagen sind nicht berücksichtigt.',
  tipClose: 'Hinweis schließen',
  tipTap: 'Tippe auf einen Ort für die Minuten. Den Startpunkt kannst du ziehen.',
  tipInstall: 'Als App auf dem Startbildschirm, auch offline.',
  tipInstallIos: 'Als App: Teilen-Symbol, dann „Zum Home-Bildschirm“.',
  legendMax: '120+ min',
};
export type Key = keyof typeof de;

const en: Record<Key, string> = {
  title: 'Berlin in Minutes',
  description: 'How long does public transport take from any point in Berlin to everywhere else?',
  mapLabel: 'Map of Berlin',
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
    'At the top you choose the <b>departure time</b>: weekday or weekend and the hour you leave. The map shows the fastest trip departing within that hour.',
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
  unreachable: 'Not reachable within the time window',
  lineShare: '<b>{names}</b> · fastest way to {pct}% of the map',
  noMatches: 'No matches in the map area',
  searchDown: 'Search is not reachable right now',
  searchOffline: 'Search needs a connection',
  freq: 'Stop frequency',
  freqHint: 'Departures per hour, all lines and directions together',
  desert: 'Transit deserts',
  desertHint: 'Where the walk to a stop plus the wait is over 10 min (20 min from 00:00 to 05:00)',
  freqLegend: 'Departures/h',
  desertLegend: 'Walk + wait',
  min: 'min',
  stationFreq: '<b>{name}</b> · {n} departures/h',
  access: 'Walk + wait for a departure: {n} min',
  accessNone: 'No stop within a 15-minute walk',
  aboutLayers:
    '<b>Stop frequency</b> shows how often each stop is served in the time window. <b>Transit deserts</b> shades places where the walk to a stop plus the average wait (half the gap between departures) is over 10 and 15 min, or 20 and 30 min between 00:00 and 05:00. Both are in the menu.',
  minutesBoth: '<b><i class="p1"></i>{a} · <i class="p2"></i>{b} min</b> {when}',
  secondHere: '2nd start',
  favHere: '★ Save',
  meet: 'Meeting point: colours show the longer of the two trips',
  meetClose: 'Remove the second start',
  favTitle: 'Favourite places',
  favEmpty:
    'No places yet. Add work, friends or favourite bars: with a start point you see the trip time to each and an average.',
  favAdd: '+ Search a place',
  favImport: 'Import a list',
  favExport: 'Export',
  favHelp:
    'Import: Google Takeout (Maps "Saved Places" as .json or lists as .csv) or a list exported here.',
  favWeight: 'Importance',
  weight3: 'Important',
  weight2: 'Normal',
  weight1: 'Now and then',
  favRemove: 'Remove {name}',
  favScore: '★ avg {n} min to {count} favourite places',
  favImporting: 'Importing {i} of {n}…',
  favImported: '{n} places imported, {missing} not found.',
  favImportFailed: 'The file could not be read.',
  aboutCompare:
    '<b>Meeting point:</b> after setting a start, tap a second place and choose "2nd start". Colours then show the longer of the two trips, so where you can both be in N minutes. <b>Favourite places</b> (in the menu) show the trip time from the start point to each place and an average weighted by importance; unreachable places count as 120 min. The list stays in your browser.',
  whenOpen: 'Choose departure time',
  whenTitle: 'Departure',
  whenDay: 'Day',
  whenHour: 'Hour of departure',
  weekday: 'Weekday',
  weekend: 'Weekend',
  weekdayAt: 'Weekday {hour}',
  weekendAt: 'Weekend {hour}',
  onWeekdays: 'on weekdays from {hour}',
  onWeekends: 'at weekends from {hour}',
  whenNote:
    'Shows the fastest trips departing within the chosen hour. Weekday means a Tuesday to Thursday, weekend a Saturday; 00:00 to 04:00 at the weekend is the night from Friday to Saturday.',
  locate: 'Use my location as start',
  locating: 'Finding your location…',
  locateOutside: 'Your location is outside the map (Berlin and a narrow edge).',
  locateDenied: 'No access to your location. Allow it in the browser settings.',
  locateFailed: 'Location not found.',
  share: 'Share a link to this map',
  shareText: 'How far you get from here by bus and train',
  linkCopied: 'Link copied',
  install: 'Install as an app',
  installNow: 'Install',
  iso: 'Outlines 15, 30, 45 min',
  isoHint: 'Lines showing how far you get in 15, 30 and 45 minutes',
  opacity: 'Colour opacity',
  opacityHint: 'Lower it to read street names',
  dataNote: 'Timetable of {date}. Engineering works and disruptions are not included.',
  aboutData:
    'The map uses the regular timetable of a weekday (Tuesday to Thursday) and a Saturday. Engineering works, replacement services and disruptions on other days are not included.',
  tipClose: 'Close hint',
  tipTap: 'Tap a place to see the minutes. You can drag the start point.',
  tipInstall: 'Install it on your home screen, works offline too.',
  tipInstallIos: 'As an app: tap Share, then “Add to Home Screen”.',
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
