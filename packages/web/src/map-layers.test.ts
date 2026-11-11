import { describe, expect, it } from 'vitest';
import { FILL_OUTLINE_WIDTH } from './map-layers';

describe('time lines over the colour fill', () => {
  it('are thin, 15 min boldest, then 30, 45 and the hairlines (S013)', () => {
    // ['interpolate', ['linear'], ['zoom'], 9, widths at 9, 14, widths at 14]
    const stops = FILL_OUTLINE_WIDTH as unknown as unknown[];
    for (const m of [stops[4], stops[6]] as (string | number)[][]) {
      const w = [m[3], m[5], m[7], m[8]] as number[];
      expect([...w].sort((a, b) => b - a)).toEqual(w);
      // At most 2.1 px even at street zoom: the fill carries the minutes.
      expect(Math.max(...w)).toBeLessThanOrEqual(2.1);
    }
  });
});

describe('stops by zoom (S057)', () => {
  it('shows dots and letters only from street level, and the big stations by name above it', async () => {
    const { addMapLayers, STREET_ZOOM } = await import('./map-layers');
    const layers: Record<string, Record<string, unknown>> = {};
    const map = {
      getStyle: () => ({ layers: [] }),
      setPaintProperty: () => {},
      addSource: () => {},
      addLayer: (l: { id: string }) => (layers[l.id] = l),
      getLayer: () => undefined,
      on: () => {},
    };
    addMapLayers(map as never, {
      routes: false,
      iso: false,
      network: true,
      desertCanvas: {} as never,
    });
    expect(STREET_ZOOM).toBe(14);
    for (const id of [
      'stops-major',
      'stops-minor',
      'stops-letter',
      'stops-major-name',
      'stops-minor-name',
    ])
      expect(layers[id]!.minzoom).toBe(STREET_ZOOM);
    const hubs = layers['stops-hub-name']!;
    expect(hubs.maxzoom).toBe(STREET_ZOOM);
    expect(hubs.filter).toEqual(['has', 'h']);
  });
});

describe('the network by zoom (S058)', () => {
  it('draws rail from the city view, tram from 12, bus from 14, under the time rings', async () => {
    const { addMapLayers, NETWORK_OPACITY } = await import('./map-layers');
    const layers: Record<string, Record<string, unknown>> = {};
    const before: Record<string, string | undefined> = {};
    const map = {
      getStyle: () => ({ layers: [] }),
      setPaintProperty: () => {},
      addSource: () => {},
      addLayer: (l: { id: string }, b?: string) => {
        layers[l.id] = l;
        before[l.id] = b;
      },
      getLayer: () => undefined,
      on: () => {},
    };
    addMapLayers(map as never, {
      routes: false,
      iso: false,
      network: true,
      desertCanvas: {} as never,
    });
    expect(layers['network-rail-line']!.minzoom).toBe(0);
    expect(layers['network-tram-line']!.minzoom).toBe(12);
    expect(layers['network-bus-line']!.minzoom).toBe(14);
    for (const g of ['rail', 'tram', 'bus']) {
      expect(before[`network-${g}-line`]).toBe('outlines-casing');
      expect((layers[`network-${g}-line`]!.paint as Record<string, unknown>)['line-opacity']).toBe(
        NETWORK_OPACITY,
      );
    }
    expect(NETWORK_OPACITY).toBeLessThan(0.5);
  });
});

describe('the switch for the network and stops (S060)', () => {
  it('hides every network line, stop dot and stop name when off, and only those', async () => {
    const { addMapLayers, NETWORK_LAYERS, STOP_LAYERS } = await import('./map-layers');
    const added = (network: boolean) => {
      type Layer = { id: string; layout?: { visibility?: string } };
      const layers: Record<string, Layer> = {};
      const map = {
        getStyle: () => ({ layers: [] }),
        setPaintProperty: () => {},
        addSource: () => {},
        addLayer: (l: Layer) => (layers[l.id] = l),
        getLayer: () => undefined,
        on: () => {},
      };
      addMapLayers(map as never, { routes: true, iso: true, network, desertCanvas: {} as never });
      return layers;
    };
    const ours = [...NETWORK_LAYERS, ...STOP_LAYERS];
    // Every stop layer is in the list, so none stays when the switch is off.
    const off = added(false);
    expect(
      Object.keys(off).filter((id) => id.startsWith('stops-') || id.startsWith('network-')),
    ).toEqual(expect.arrayContaining(ours));
    for (const id of Object.keys(off).filter(
      (id) => id.startsWith('stops-') || id.startsWith('network-'),
    ))
      expect(ours).toContain(id);
    for (const id of ours) expect(off[id]!.layout?.visibility).toBe('none');
    const on = added(true);
    for (const id of ours) expect(on[id]!.layout?.visibility).toBe('visible');
    // The trip's own stops are not part of it.
    expect(off['trip-stops']?.layout?.visibility).not.toBe('none');
  });
});
