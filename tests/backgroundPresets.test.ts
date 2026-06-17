import { describe, it, expect, beforeEach } from 'vitest';
import { LayerControl } from '../src/lib/core/LayerControl';

const STORAGE_KEY = 'test:bg-presets';

// jsdom in this config does not provide localStorage; supply a minimal polyfill.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  } as Storage;
}

/**
 * Build a LayerControl wired to a minimal in-memory mock map so the
 * background-preset API can be exercised without a real MapLibre instance.
 */
function makeControl(initialVisibility: Record<string, boolean>) {
  const visibility = new Map<string, boolean>(
    Object.entries(initialVisibility),
  );
  const layerIds = Object.keys(initialVisibility);

  const mockMap = {
    getStyle: () => ({
      layers: layerIds.map((id) => ({ id, type: 'fill' })),
    }),
    getLayer: (id: string) => (visibility.has(id) ? { id } : undefined),
    getLayoutProperty: (id: string, _prop: string) =>
      visibility.get(id) === false ? 'none' : 'visible',
    setLayoutProperty: (id: string, _prop: string, value: string) => {
      visibility.set(id, value !== 'none');
    },
  };

  const control = new LayerControl({
    backgroundPresetStorageKey: STORAGE_KEY,
    excludeDrawnLayers: false,
  });

  // Inject the mock map/panel and treat all known layers as basemap layers.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  (control as any).panel = document.createElement('div');
  (control as any).basemapLayerIds = new Set(layerIds);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { control, visibility };
}

describe('background presets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads no presets initially', () => {
    const { control } = makeControl({ water: true });
    expect(control.getBackgroundPresets()).toEqual({});
  });

  it('captures current visibility of controllable layers', () => {
    const { control } = makeControl({ water: true, roads: false, labels: true });
    expect(control.getBackgroundLayerVisibility()).toEqual({
      water: true,
      roads: false,
      labels: true,
    });
  });

  it('saves and persists a named preset to localStorage', () => {
    const { control } = makeControl({ water: true, roads: false });
    control.saveBackgroundPreset('minimal');

    const presets = control.getBackgroundPresets();
    expect(presets).toEqual({ minimal: { water: true, roads: false } });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual(presets);
  });

  it('ignores empty preset names', () => {
    const { control } = makeControl({ water: true });
    control.saveBackgroundPreset('   ');
    expect(control.getBackgroundPresets()).toEqual({});
  });

  it('applies a saved preset back onto the map', () => {
    const { control, visibility } = makeControl({ water: true, roads: true });
    control.saveBackgroundPreset('hide-roads-snapshot');

    // Mutate live state, then re-apply by writing the desired config directly.
    control.applyBackgroundLayerVisibility({ water: false, roads: true });
    expect(visibility.get('water')).toBe(false);
    expect(visibility.get('roads')).toBe(true);

    const applied = control.applyBackgroundPreset('hide-roads-snapshot');
    expect(applied).toBe(true);
    expect(visibility.get('water')).toBe(true);
    expect(visibility.get('roads')).toBe(true);
  });

  it('returns false when applying a missing preset', () => {
    const { control } = makeControl({ water: true });
    expect(control.applyBackgroundPreset('does-not-exist')).toBe(false);
  });

  it('only applies layers that exist in the current style', () => {
    const { control, visibility } = makeControl({ water: true });
    control.applyBackgroundLayerVisibility({ water: false, ghost: false });
    expect(visibility.get('water')).toBe(false);
    expect(visibility.has('ghost')).toBe(false);
  });

  it('deletes a preset and persists the removal', () => {
    const { control } = makeControl({ water: true });
    control.saveBackgroundPreset('a');
    control.saveBackgroundPreset('b');
    control.deleteBackgroundPreset('a');

    expect(Object.keys(control.getBackgroundPresets())).toEqual(['b']);
  });

  it('recovers from malformed stored JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const { control } = makeControl({ water: true });
    expect(control.getBackgroundPresets()).toEqual({});
  });

  it('fires the change callback when presets mutate', () => {
    const calls: number[] = [];
    const control = new LayerControl({
      backgroundPresetStorageKey: STORAGE_KEY,
      excludeDrawnLayers: false,
      onBackgroundPresetsChange: (presets) =>
        calls.push(Object.keys(presets).length),
    });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (control as any).map = {
      getStyle: () => ({ layers: [{ id: 'water', type: 'fill' }] }),
      getLayer: (id: string) => ({ id }),
      getLayoutProperty: () => 'visible',
      setLayoutProperty: () => {},
    };
    (control as any).panel = document.createElement('div');
    (control as any).basemapLayerIds = new Set(['water']);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    control.saveBackgroundPreset('one');
    control.deleteBackgroundPreset('one');
    expect(calls).toEqual([1, 0]);
  });
});
