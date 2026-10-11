// Fixed map features that help tell which part of Berlin you are looking at: the Ringbahn,
// the twelve Bezirke (the vector tiles only name the smaller Ortsteile, and only from zoom 11)
// and a few landmarks.
import type { FeatureCollection, LineString, Point } from 'geojson';

/** Ringbahn stations clockwise from Beusselstr., closed (S41 in the VBB timetable). */
const RING: [number, number][] = [
  [13.3294, 52.5344],
  [13.3443, 52.5362],
  [13.3677, 52.543],
  [13.3899, 52.5491],
  [13.4152, 52.5493],
  [13.4259, 52.5448],
  [13.4391, 52.5401],
  [13.4548, 52.5293],
  [13.465, 52.5237],
  [13.4743, 52.5154],
  [13.469, 52.5034],
  [13.4615, 52.4937],
  [13.4556, 52.473],
  [13.4432, 52.4695],
  [13.4312, 52.4677],
  [13.3845, 52.471],
  [13.3656, 52.4759],
  [13.3516, 52.4793],
  [13.3415, 52.4782],
  [13.3295, 52.4777],
  [13.3119, 52.4801],
  [13.3003, 52.4887],
  [13.2906, 52.496],
  [13.2839, 52.5008],
  [13.2836, 52.5077],
  [13.2844, 52.5179],
  [13.2993, 52.5304],
  [13.3294, 52.5344],
];

/** Rough label points of the Bezirke, placed where the label reads well rather than at the exact centroid. */
const BEZIRKE: [string, number, number][] = [
  ['Mitte', 13.37, 52.53],
  ['Friedrichshain-Kreuzberg', 13.43, 52.502],
  ['Pankow', 13.43, 52.6],
  ['Charlottenburg-Wilmersdorf', 13.28, 52.503],
  ['Spandau', 13.18, 52.535],
  ['Steglitz-Zehlendorf', 13.24, 52.435],
  ['Tempelhof-Schöneberg', 13.38, 52.44],
  ['Neukölln', 13.45, 52.44],
  ['Treptow-Köpenick', 13.6, 52.43],
  ['Marzahn-Hellersdorf', 13.59, 52.535],
  ['Lichtenberg', 13.5, 52.53],
  ['Reinickendorf', 13.29, 52.6],
];

const LANDMARKS: [string, number, number][] = [
  ['Fernsehturm', 13.4094, 52.5208],
  ['Brandenburger Tor', 13.3777, 52.5163],
  ['Siegessäule', 13.3501, 52.5145],
  ['Tempelhofer Feld', 13.4011, 52.4731],
  ['Olympiastadion', 13.2394, 52.5147],
  ['Schloss Charlottenburg', 13.2957, 52.5209],
  ['Flughafen BER', 13.5033, 52.3667],
];

export const ringLine: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: RING } },
  ],
};

const points = (list: [string, number, number][]): FeatureCollection<Point, { name: string }> => ({
  type: 'FeatureCollection',
  features: list.map(([name, lon, lat]) => ({
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  })),
});
export const bezirke = points(BEZIRKE);
export const landmarks = points(LANDMARKS);
