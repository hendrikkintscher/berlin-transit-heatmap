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
  menuChip: 'Mehr',
  menuClose: 'Menü schließen',
  menuMap: 'Karte',
  menuLanguage: 'Sprache',
  about: 'Über diese Karte',
  hint: 'Tippe auf die Karte oder suche einen Startpunkt',
  startHere: 'Hier starten',
  legend: 'Legende Reisezeit in Minuten',
  legendExtra: 'Legende: Minuten mehr als am besten Treffpunkt',
  close: 'Schließen',
  aboutHow:
    'Tippe irgendwo auf die Karte oder suche eine Adresse, um einen Startpunkt zu setzen. Die Farben zeigen die Reisezeit mit Bus und Bahn zu jedem Ort, inklusive Fußwegen zu und von den Haltestellen, gemessen auf echten Straßen und Wegen mit 4 km/h (im Menü einstellbar): 5-Minuten-Stufen bis 20 Minuten, 2½-Minuten-Stufen von 20 bis 50 Minuten und breitere Stufen darüber. Tippst du danach auf einen Ort, siehst du die Minuten und die Verbindung dorthin. Tippe auf einen Startpunkt, um ihn zu entfernen.',
  aboutLines:
    '<b>Linien</b> zeigt die Abschnitte von S-Bahn, U-Bahn, Tram und Bus, auf die die schnellsten Fahrten von deinem Startpunkt angewiesen sind. Je dicker die Linie, desto mehr der Karte erreichst du darüber. Tippe auf eine Linie, um ihren Namen zu sehen.',
  aboutWindows:
    'Oben wählst du die <b>Zeit</b>: heute, einen der nächsten Tage oder einen typischen Werktag oder Wochenende, die Stunde und ob du dann losfährst oder ankommst. <b>Typisch</b> ist der Durchschnitt über die Stunde mit Wartezeit, also was dich erwartet, wenn du ohne Blick auf den Fahrplan losgehst; <b>Bestfall</b> ist die schnellste Fahrt, wenn du genau passend zur Abfahrt gehst. Mit <b>Vergleichen</b> färbt die Karte, wie viel länger (rot) oder kürzer (grün) die Fahrt zu einer zweiten Zeit dauert.',
  aboutArea: 'Die Karte deckt Berlin und den nahen Rand ab; die Suche schlägt nur Orte darin vor.',
  credits:
    'Fahrplandaten: <a href="https://www.vbb.de/vbb-services/api-open-data/datensaetze/" target="_blank" rel="noopener">VBB Open Data</a> (CC BY 4.0). Karte und Fußwege: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL). Adresssuche: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> von Komoot.',
  feedLoading: 'Fahrplan wird geladen…',
  feedInfo: 'Fahrplan des VBB, Verkehrstag {date} (Datensatz {version}, {stops} Haltestellen).',
  computing: 'Wird berechnet…',
  computed: 'Berechnet in {s} s · tippe auf die Karte für Minuten',
  failed: 'Etwas ist schiefgelaufen: {message}',
  minutes: '<b>{n} Min.</b>',
  unreachable: 'Im Zeitfenster nicht erreichbar',
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
  secondHere: '{n}. Start',
  newStart: 'Neuer Start',
  extraMinutes: '+{n} Min. gegenüber dem besten Treffpunkt',
  meetSuggestion: 'Treffpunkt-Vorschlag {name}: {list} Min.',
  favHere: '★ Merken',
  meet: 'Treffpunkt: Farben zeigen Minuten mehr als am besten Ort, 1–3 sind Vorschläge',
  meetClose: 'Weitere Startpunkte entfernen',
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
  livingMap: 'Wohnlage-Karte',
  livingHelp:
    'Die Wohnlage-Karte färbt ganz Berlin nach dem gewichteten Schnitt zu deinen Lieblingsorten (Typisch, Ankunft in der gewählten Stunde): Grün ist, wo alles nah ist.',
  living: 'Wohnlage: Ø zu {count} Lieblingsorten, {when}',
  specialClose: 'Zurück zur Karte',
  homeHere: '🌙 Bis wann heim?',
  home: 'Heimweg nach {name}, {night}: bis wann es schnell nach Hause geht',
  homeWeekday: 'unter der Woche',
  homeWeekend: 'am Wochenende',
  homeProgress: 'Heimweg-Karte: Stunde {i} von {n}…',
  homeNone: 'Nach 20 Uhr kein Weg nach Hause in 2 Stunden',
  homeAllNight: '<b>Die ganze Nacht schnell nach Hause</b>',
  homeFast: '<b>Schnell heim bis {time}</b>',
  homeNightAll: 'danach mit dem Nachtnetz, die ganze Nacht',
  homeNightUntil: 'danach mit dem Nachtnetz bis {time}',
  homeNoNight: 'danach keine Verbindung mehr',
  homeFav: 'Bis wann heim zu {name}?',
  legendHome: 'Legende: letzte schnelle Verbindung nach Hause, Uhrzeit',
  livingProgress: 'Wohnlage-Karte: Ort {i} von {n}…',
  livingScore: '<b>Ø {n} Min.</b> zu deinen Lieblingsorten',
  favImporting: 'Importiere {i} von {n}…',
  favImported: '{n} Orte importiert, {missing} nicht gefunden.',
  favImportFailed: 'Die Datei konnte nicht gelesen werden.',
  aboutCompare:
    '<b>Treffpunkt:</b> Tippe nach dem Start auf einen weiteren Ort und wähle „2. Start“, für Gruppen bis zu fünf Starts. Die Farben zeigen dann die längste der Fahrten, also wo ihr alle in N Minuten sein könnt. <b>Lieblingsorte</b> (im Menü) zeigen für den Startpunkt die Fahrzeit zu jedem Ort und einen nach Wichtigkeit gewichteten Schnitt; nicht erreichbare Orte zählen mit 120 Min. Die Liste bleibt in deinem Browser.',
  whenOpen: 'Zeit wählen',
  whenTitle: 'Wann?',
  whenDay: 'Tag',
  whenHour: 'Stunde der Abfahrt',
  weekday: 'Mo–Fr',
  weekend: 'Sa+So',
  weekdayAt: 'Mo–Fr ab {hour}',
  weekendAt: 'Sa+So ab {hour}',
  today: 'Heute',
  tomorrow: 'Morgen',
  dateAt: '{day} ab {hour}',
  dateArr: '{day} an {hour}',
  onToday: 'heute',
  onTomorrow: 'morgen',
  onDay: 'am {day}',
  onDateAt: '{day} ab {hour}',
  onDateArr: '{day}, Ankunft {hour} bis {next}',
  homeDate: 'in der Nacht {day} auf {next}',
  whenTypical: 'Typischer Tag, zum Planen',
  weekdayNames: 'So,Mo,Di,Mi,Do,Fr,Sa',
  dataNoteDate:
    'Fahrplan des {date} laut VBB, mit Baustellen und Ersatzverkehr. Kurzfristige Störungen sind nicht enthalten.',
  dataNoteFallback:
    'Für diesen Tag gibt es noch keinen eigenen Fahrplan; die Karte zeigt den typischen Fahrplan vom {date}.',
  onWeekdays: 'werktags ab {hour}',
  onWeekends: 'am Wochenende ab {hour}',
  whenNote:
    'Heute und die nächsten Tage zeigen den echten Fahrplan des Tages, mit Baustellen und Ersatzverkehr. Typisch Mo–Fr ist ein Dienstag bis Donnerstag, Sa+So ein Samstag (sonntags fährt manches seltener); 0 bis 4 Uhr bei Sa+So ist die Nacht von Freitag auf Samstag.',
  locate: 'Mein Standort als Start',
  locating: 'Standort wird gesucht…',
  locateOutside: 'Dein Standort liegt außerhalb der Karte (Berlin, Potsdam und Umland).',
  locateDenied: 'Kein Zugriff auf den Standort. Erlaube ihn in den Browser-Einstellungen.',
  locateFailed: 'Standort nicht gefunden.',
  share: 'Link zu dieser Karte teilen',
  shareText: 'So weit kommst du von hier mit Bus und Bahn',
  linkCopied: 'Link kopiert',
  install: 'Als App installieren',
  installNow: 'Installieren',
  heat: 'Farben (Heatmap)',
  heatHint: 'Die Reisezeit als Farbfläche; ohne sie zeigen die Umrisse die Minuten',
  iso: 'Umrisse alle 5 Min.',
  travelTitle: 'Unterwegs',
  travelWalk: 'Bahn',
  travelBike: 'Rad + Bahn',
  travelBikeOnly: 'Nur Rad',
  travelHelp:
    'Rad + Bahn: mit 15 km/h zur Station und vom Ausstieg zum Ziel, 2 Min. pro Station fürs Mitnehmen, ohne Busse. Nur Rad: bis 60 Min. auf Straßen und Wegen.',
  travelBikeOnlyPill: 'Nur Rad 🚲',
  stepFree: 'Barrierefrei',
  stepFreeHint:
    'Für Rollstuhl, Kinderwagen und Koffer: nur Bahnsteige mit Aufzug oder Rampe und Fahrzeuge, die als barrierefrei markiert sind',
  isoHint: 'Linien alle 5 Minuten mit ihren Minuten, kräftiger bei 15, 30 und 45',
  opacity: 'Deckkraft der Farben',
  opacityHint: 'Weniger, um Straßennamen besser zu sehen',
  walkTitle: 'Gehtempo',
  walkHelp:
    'Für den Weg zur ersten Haltestelle und vom Ausstieg zum Ziel. Umsteigen rechnet mit 4 km/h.',
  dataNote:
    'Typischer Tag: Fahrplan vom {date}. Baustellen an anderen Tagen sind nicht berücksichtigt.',
  aboutData:
    'Für heute und die nächsten sechs Tage nutzt die Karte den echten Fahrplan jedes Tages aus dem VBB-Datensatz, der täglich neu geladen wird: Baustellen, Ersatzverkehr und Feiertage sind an genau den Tagen drin, an denen sie stattfinden. Kurzfristige Störungen und Ausfälle stehen nicht im Fahrplan und fehlen deshalb. Zum Planen gibt es außerdem einen typischen Werktag (Dienstag bis Donnerstag) und einen typischen Samstag.',
  tipClose: 'Hinweis schließen',
  readoutClose: 'Auswahl schließen',
  tipTap: 'Tippe auf einen Ort für die Minuten. Den Startpunkt kannst du ziehen.',
  tipInstall: 'Als App auf dem Startbildschirm, auch offline.',
  tipInstallIos: 'Als App: Teilen-Symbol, dann „Zum Home-Bildschirm“.',
  legendMax: '120+ min',
  legendMaxExtra: '+120',
  whenHourArr: 'Stunde der Ankunft',
  whenDir: 'Richtung',
  dirDepart: 'Losfahren',
  dirArrive: 'Ankommen',
  weekdayArr: 'Mo–Fr an {hour}',
  weekendArr: 'Sa+So an {hour}',
  onWeekdaysArr: 'werktags, Ankunft {hour} bis {next}',
  onWeekendsArr: 'am Wochenende, Ankunft {hour} bis {next}',
  measureTitle: 'Reisezeit',
  measureTypical: 'Typisch',
  measureBest: 'Bestfall',
  measureNext: 'Nächste',
  measureNoteTypical: 'Durchschnitt über die Stunde, Warten auf die Abfahrt eingerechnet.',
  measureNoteTypicalArr:
    'Durchschnitt über die Stunde: wie früh du los musst, um rechtzeitig da zu sein.',
  measureNoteBest: 'Die schnellste Fahrt in der Stunde, wenn du genau passend losgehst.',
  measureNoteNext:
    'Die nächste Verbindung, wenn du jetzt losgehst, Warten eingerechnet. Zu einer anderen Stunde: Abfahrt zur vollen Stunde.',
  measureNoteNextArr: 'Die letzte Verbindung, mit der du zur vollen Stunde ankommst.',
  compareTitle: 'Vergleichen mit',
  compareOff: 'Aus',
  compareDay: 'Vergleichstag',
  compareHour: 'Vergleichsstunde',
  compareClose: 'Vergleich beenden',
  compareChip: '{a} → {b}: rot = länger, grün = kürzer',
  cmpMinutes: '<b>{a} → {b} Min.</b> ({d})',
  legendDiff: 'Legende: Minuten länger oder kürzer zur Vergleichszeit',
  tripWalk: '{n} Min. Fußweg',
  tripBike: '{n} Min. Rad',
  tripStops: '{n} Stat.',
  tripNone: 'Keine Verbindung gefunden',
  tripNext: 'Nächste Verbindung: {n} Min.',
  tripMain: '{n} Min. · an {time}',
  tripGoNow: 'jetzt los',
  tripMissed: 'verpasst: wähle die neue Stunde für die nächsten Verbindungen',
  tripLeaveIn: 'los in {n} Min.',
  tripLeaveAt: 'los um {time}',
  chipsLabel: 'Einstellungen',
  layersChip: 'Ebenen',
  compareChipLabel: 'Vergleich',
  compareOn: 'Vergleich: {when}',
  compareNote:
    'Die Karte färbt, wie viel länger (rot) oder kürzer (grün) die Fahrt zur zweiten Zeit dauert.',
  liveCancelled: '{line} fällt aus',
  liveLate: '{line} +{n} Min.',
  liveOnTime: '{line} pünktlich',
  changesChip: '{day} anders: {lines}',
  changesTitle: '{day} anders als sonst',
  changesNote:
    'Aus dem Fahrplan der kommenden Wochen: wo U-Bahn, S-Bahn und Tram an diesem Tag nicht wie sonst fahren. Tippe auf eine Zeile, um die Strecke zu sehen. Kurzfristige Störungen fehlen.',
  changesClose: 'Hinweis schließen',
  changeGap: 'kein Verkehr {from} – {to}',
  changeSev: 'Ersatzverkehr {from} – {to}',
  changeOff: 'fährt nicht',
  changeOffSev: 'fährt nicht, Ersatzverkehr',
  changeSkip: 'hält nicht an {stop}',
  changeUntil: 'bis {date}',
  changeOneDay: 'nur an diesem Tag',
  tripLast: 'Letzte Verbindung zur vollen Stunde: {n} Min.',
  noTransfer: 'ohne Umstieg',
  oneTransfer: '1 Umstieg',
  transfers: '{n} Umstiege',
  startPoint: 'Startpunkt',
  secondPoint: 'Startpunkt {n}',
  removeStart: '✕ Entfernen',
  openGoogle: 'Google Maps ↗',
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
  menuChip: 'More',
  menuClose: 'Close menu',
  menuMap: 'Map',
  menuLanguage: 'Language',
  about: 'About this map',
  hint: 'Tap the map or search to choose a start',
  startHere: 'Start here',
  legend: 'Travel time legend, minutes',
  legendExtra: 'Legend: minutes more than at the best meeting spot',
  close: 'Close',
  aboutHow:
    'Tap anywhere or search for an address to set a start point. Colours show the public-transport travel time to each spot, including walking to and from stops, measured along real streets and paths at 4 km/h (adjustable in the menu): 5-minute bands up to 20 minutes, 2½-minute bands from 20 to 50 minutes, and wider bands beyond. Tap a place afterwards to see the minutes and the connection there. Tap a start point to remove it.',
  aboutLines:
    '<b>Lines</b> shows the stretches of S-Bahn, U-Bahn, tram and bus that the fastest trips from your start point rely on. The thicker the line, the more of the map is reached over it. Tap a line to see its name.',
  aboutWindows:
    'At the top you choose the <b>time</b>: today, one of the next days, or a typical weekday or weekend, the hour, and whether you leave or arrive then. <b>Typical</b> is the average over the hour including the wait, so what to expect if you head out without checking the timetable; <b>best case</b> is the fastest trip if you time your departure exactly. <b>Compare</b> colours how much longer (red) or shorter (green) the trip takes at a second time.',
  aboutArea:
    'The map covers Berlin and its immediate surroundings; search only suggests places inside it.',
  credits:
    'Timetable data: <a href="https://www.vbb.de/vbb-services/api-open-data/datensaetze/" target="_blank" rel="noopener">VBB open data</a> (CC BY 4.0). Map and footpaths: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL). Address search: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> by Komoot.',
  feedLoading: 'Loading timetable…',
  feedInfo: 'Timetable from VBB, service day {date} (feed {version}, {stops} stops).',
  computing: 'Computing…',
  computed: 'Computed in {s} s · tap the map for minutes',
  failed: 'Something went wrong: {message}',
  minutes: '<b>{n} min</b>',
  unreachable: 'Not reachable within the time window',
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
  secondHere: 'Start {n}',
  newStart: 'New start',
  extraMinutes: '+{n} min compared with the best meeting spot',
  meetSuggestion: 'Suggested meeting point {name}: {list} min',
  favHere: '★ Save',
  meet: 'Meeting point: colours show minutes more than at the best spot, 1–3 are suggestions',
  meetClose: 'Remove the other starts',
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
  livingMap: 'Where-to-live map',
  livingHelp:
    'The where-to-live map colours all of Berlin by the weighted average to your favourite places (Typical, arriving in the chosen hour): green is where everything is close.',
  living: 'Where to live: avg to {count} favourite places, {when}',
  specialClose: 'Back to the map',
  homeHere: '🌙 Last way home',
  home: 'Way home to {name}, {night}: until when it is quick to get home',
  homeWeekday: 'on weeknights',
  homeWeekend: 'at weekends',
  homeProgress: 'Way-home map: hour {i} of {n}…',
  homeNone: 'No way home within 2 hours after 20:00',
  homeAllNight: '<b>Quick to get home all night</b>',
  homeFast: '<b>Quick home until {time}</b>',
  homeNightAll: 'then by night network, all night',
  homeNightUntil: 'then by night network until {time}',
  homeNoNight: 'no connection after that',
  homeFav: 'Last way home to {name}',
  legendHome: 'Legend: last quick connection home, time of day',
  livingProgress: 'Where-to-live map: place {i} of {n}…',
  livingScore: '<b>avg {n} min</b> to your favourite places',
  favImporting: 'Importing {i} of {n}…',
  favImported: '{n} places imported, {missing} not found.',
  favImportFailed: 'The file could not be read.',
  aboutCompare:
    '<b>Meeting point:</b> after setting a start, tap another place and choose "Start 2"; groups can add up to five starts. Colours then show the longest of the trips, so where you can all be in N minutes. <b>Favourite places</b> (in the menu) show the trip time from the start point to each place and an average weighted by importance; unreachable places count as 120 min. The list stays in your browser.',
  whenOpen: 'Choose the time',
  whenTitle: 'When?',
  whenDay: 'Day',
  whenHour: 'Hour of departure',
  weekday: 'Mon–Fri',
  weekend: 'Sat+Sun',
  weekdayAt: 'Mon–Fri dep {hour}',
  weekendAt: 'Sat+Sun dep {hour}',
  today: 'Today',
  tomorrow: 'Tomorrow',
  dateAt: '{day} dep {hour}',
  dateArr: '{day} arr {hour}',
  onToday: 'today',
  onTomorrow: 'tomorrow',
  onDay: 'on {day}',
  onDateAt: '{day} from {hour}',
  onDateArr: '{day}, arriving {hour}–{next}',
  homeDate: 'in the night from {day} to {next}',
  whenTypical: 'Typical day, for planning',
  weekdayNames: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
  dataNoteDate:
    "Timetable of {date} from VBB, with engineering works and replacement services. Short-notice disruptions aren't included.",
  dataNoteFallback:
    "This day doesn't have its own timetable yet; the map shows the typical timetable of {date}.",
  onWeekdays: 'on weekdays from {hour}',
  onWeekends: 'at weekends from {hour}',
  whenNote:
    "Today and the next days show that day's real timetable, engineering works and replacement services included. Typical Mon–Fri is a Tuesday to Thursday, Sat+Sun a Saturday (some lines run less often on Sundays); 00:00 to 04:00 on Sat+Sun is the night from Friday to Saturday.",
  locate: 'Use my location as start',
  locating: 'Finding your location…',
  locateOutside: 'Your location is outside the map (Berlin, Potsdam and the surrounding area).',
  locateDenied: 'No access to your location. Allow it in the browser settings.',
  locateFailed: 'Location not found.',
  share: 'Share a link to this map',
  shareText: 'How far you get from here by bus and train',
  linkCopied: 'Link copied',
  install: 'Install as an app',
  installNow: 'Install',
  heat: 'Colours (heatmap)',
  heatHint: 'Travel time as a colour fill; without it the outlines show the minutes',
  iso: 'Outlines every 5 min',
  travelTitle: 'Getting around',
  travelWalk: 'Transit',
  travelBike: 'Bike + train',
  travelBikeOnly: 'Bike only',
  travelHelp:
    'Bike + train: 15 km/h to the station and from the last stop, 2 min per station to take the bike along, no buses. Bike only: up to 60 min on streets and paths.',
  travelBikeOnlyPill: 'Bike only 🚲',
  stepFree: 'Accessible',
  stepFreeHint:
    'For wheelchairs, prams and suitcases: only platforms with a lift or ramp, and vehicles marked accessible',
  isoHint: 'Lines every 5 minutes with their minutes, bolder at 15, 30 and 45',
  opacity: 'Colour opacity',
  opacityHint: 'Lower it to read street names',
  walkTitle: 'Walking speed',
  walkHelp:
    'For the walk to the first stop and from the last stop to the spot. Changing trains assumes 4 km/h.',
  dataNote: 'Typical day: timetable of {date}. Engineering works on other days are not included.',
  aboutData:
    "For today and the next six days the map uses each day's real timetable from the VBB feed, which is reloaded daily: engineering works, replacement services and holidays show on exactly the days they happen. Short-notice disruptions and cancellations aren't in the timetable, so they are missing. For planning there is also a typical weekday (Tuesday to Thursday) and a typical Saturday.",
  tipClose: 'Close hint',
  readoutClose: 'Close selection',
  tipTap: 'Tap a place to see the minutes. You can drag the start point.',
  tipInstall: 'Install it on your home screen, works offline too.',
  tipInstallIos: 'As an app: tap Share, then “Add to Home Screen”.',
  legendMax: '120+ min',
  legendMaxExtra: '+120',
  whenHourArr: 'Hour of arrival',
  whenDir: 'Direction',
  dirDepart: 'Leave',
  dirArrive: 'Arrive',
  weekdayArr: 'Mon–Fri arr {hour}',
  weekendArr: 'Sat+Sun arr {hour}',
  onWeekdaysArr: 'on weekdays, arriving {hour}–{next}',
  onWeekendsArr: 'at weekends, arriving {hour}–{next}',
  measureTitle: 'Travel time',
  measureTypical: 'Typical',
  measureBest: 'Best case',
  measureNext: 'Next',
  measureNoteTypical: 'Average over the hour, including the wait for the departure.',
  measureNoteTypicalArr: 'Average over the hour: how early you need to leave to get there in time.',
  measureNoteBest: 'The fastest trip in the hour, if you time your departure exactly.',
  measureNoteNext:
    'The next connection if you leave now, waiting included. For another hour: leaving on the hour.',
  measureNoteNextArr: 'The last connection that gets you there on the hour.',
  compareTitle: 'Compare with',
  compareOff: 'Off',
  compareDay: 'Comparison day',
  compareHour: 'Comparison hour',
  compareClose: 'Stop comparing',
  compareChip: '{a} → {b}: red = longer, green = shorter',
  cmpMinutes: '<b>{a} → {b} min</b> ({d})',
  legendDiff: 'Legend: minutes longer or shorter at the comparison time',
  tripWalk: 'walk {n} min',
  tripBike: 'cycle {n} min',
  tripStops: '{n} stops',
  tripNone: 'No connection found',
  tripNext: 'Next connection: {n} min',
  tripMain: '{n} min · arr {time}',
  tripGoNow: 'leave now',
  tripMissed: 'missed: pick the new hour for the next connections',
  tripLeaveIn: 'leave in {n} min',
  tripLeaveAt: 'leave at {time}',
  chipsLabel: 'Settings',
  layersChip: 'Layers',
  compareChipLabel: 'Compare',
  compareOn: 'Compare: {when}',
  compareNote:
    'The map colours how much longer (red) or shorter (green) the trip takes at the second time.',
  liveCancelled: '{line} cancelled',
  liveLate: '{line} +{n} min',
  liveOnTime: '{line} on time',
  changesChip: 'Changes {day}: {lines}',
  changesTitle: 'Changes {day}',
  changesNote:
    "From the timetable of the coming weeks: where U-Bahn, S-Bahn and tram don't run as usual on this day. Tap a line to see the stretch. Short-notice disruptions are not included.",
  changesClose: 'Close notice',
  changeGap: 'no service {from} – {to}',
  changeSev: 'replacement buses {from} – {to}',
  changeOff: 'not running',
  changeOffSev: 'not running, replacement buses',
  changeSkip: 'does not stop at {stop}',
  changeUntil: 'until {date}',
  changeOneDay: 'this day only',
  tripLast: 'Last connection by the hour: {n} min',
  noTransfer: 'no change',
  oneTransfer: '1 change',
  transfers: '{n} changes',
  startPoint: 'Start point',
  secondPoint: 'Start {n}',
  removeStart: '✕ Remove',
  openGoogle: 'Google Maps ↗',
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
