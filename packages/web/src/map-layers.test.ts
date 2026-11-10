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
    addMapLayers(map as never, { routes: false, iso: false, desertCanvas: {} as never });
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
