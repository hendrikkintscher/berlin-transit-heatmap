// The add-on layers (S047, S049): their own chunk, imported only when a layer is switched
// on, after the first map. Today one add-on, the Cash Group ATMs from OpenStreetMap
// (decision 0014), built nightly into data/<region>/atm.json (scripts/addons/atms.mjs).
import type maplibregl from 'maplibre-gl';
import { MAP_TEXT } from './colors';
import { ATM_LAYERS, BOLD_FONT, REGULAR_FONT } from './map-layers';

/** The file as scripts/addons/atms.mjs writes it. */
export interface AtmFile {
  v: 1;
  banks: string[];
  hours: string[];
  /** [lon, lat, bank, hours or -1] */
  p: [number, number, number, number][];
}

export interface AtmProps {
  bank: string;
  hours: string;
}

export function atmFeatures(d: AtmFile): GeoJSON.FeatureCollection<GeoJSON.Point, AtmProps> {
  return {
    type: 'FeatureCollection',
    features: d.p.map(([lon, lat, b, h]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { bank: d.banks[b] ?? '', hours: h >= 0 ? (d.hours[h] ?? '') : '' },
    })),
  };
}

const ATM_COLOR = '#0b6e4f';

/**
 * The ATMs from street zoom: a green dot, a white "€" on it from zoom 14 and the bank's
 * name beside it from zoom 15. Under the time rings' minute labels like the stops, so the
 * trip and its stops stay on top.
 */
export function addAtmLayers(map: maplibregl.Map, data: AtmFile) {
  const [dots, euro, names] = ATM_LAYERS;
  // After a failed first try some of it may be there already: added only what is missing.
  const source = map.getSource(dots) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(atmFeatures(data));
  else map.addSource(dots, { type: 'geojson', data: atmFeatures(data) });
  const before = map.getLayer('outlines-label') ? 'outlines-label' : undefined;
  const add = (l: maplibregl.LayerSpecification) => {
    if (!map.getLayer(l.id)) map.addLayer(l, before);
  };
  add({
    id: dots,
    type: 'circle',
    source: dots,
    minzoom: 12,
    paint: {
      'circle-color': ATM_COLOR,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 14, 6, 17, 9],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  add({
    id: euro,
    type: 'symbol',
    source: dots,
    minzoom: 14,
    layout: {
      'text-field': '€',
      'text-font': BOLD_FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 14, 8, 17, 12],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff' },
  });
  add({
    id: names,
    type: 'symbol',
    source: dots,
    minzoom: 15,
    layout: {
      'text-field': ['get', 'bank'],
      'text-font': REGULAR_FONT,
      'text-size': 10,
      'text-anchor': 'left',
      'text-offset': [1, 0],
      'text-optional': true,
    },
    paint: { 'text-color': MAP_TEXT, 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  });
}

/** Shows or hides the ATM layers (added already). */
export function showAtmLayers(map: maplibregl.Map, on: boolean) {
  for (const id of ATM_LAYERS)
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
}
