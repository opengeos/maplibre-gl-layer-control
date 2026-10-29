import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

/** A mock map that records its listeners, so a test can see what the control leaves behind. */
function makeMap(layerIds: string[]) {
  const listeners: Record<string, Set<(...args: unknown[]) => void>> = {};
  const container = document.createElement("div");
  return {
    listeners,
    getContainer: () => container,
    getStyle: () => ({
      sources: {},
      layers: layerIds.map((id) => ({ id, type: "fill", source: id })),
    }),
    getLayer: (id: string) =>
      layerIds.includes(id) ? { id, type: "fill", source: id } : undefined,
    getLayoutProperty: () => "visible",
    setLayoutProperty: () => {},
    getPaintProperty: () => 0.5,
    on: (type: string, fn: (...args: unknown[]) => void) => {
      (listeners[type] ??= new Set()).add(fn);
    },
    off: (type: string, fn: (...args: unknown[]) => void) => {
      listeners[type]?.delete(fn);
    },
  };
}

/** A control showing `n` layers, as a mock map would have them. */
function makeControl(n: number) {
  const ids = Array.from({ length: n }, (_, i) => `layer-${i}`);
  const map = makeMap(ids);
  const control = new LayerControl({
    excludeDrawnLayers: false,
    enableDragAndDrop: false,
    showLayerSymbol: false,
    showStyleEditor: false,
    enableContextMenu: false,
  });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = map;
  (control as any).panel = document.createElement("div");
  (control as any).basemapLayerIds = new Set(["absent-basemap"]);
  (control as any).autoDetectLayers();
  (control as any).buildLayerItems();
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { control, map, ids };
}

describe("syncing layer states from the map", () => {
  it("finds the panel rows once per sync, not once per layer", () => {
    const { control } = makeControl(200);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const panel: HTMLElement = (control as any).panel;
    const scan = vi.spyOn(panel, "querySelectorAll");
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).updateLayerStatesFromMap();
    const rowScans = scan.mock.calls.filter(
      ([sel]) => sel === ".layer-control-item",
    );
    expect(rowScans.length).toBeLessThanOrEqual(1);
  });

  it("still updates every row's checkbox and opacity slider", () => {
    const { control, map } = makeControl(3);
    map.getLayoutProperty = () => "none";
    map.getPaintProperty = () => 0.25;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).updateLayerStatesFromMap();
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const panel: HTMLElement = (control as any).panel;
    const rows = Array.from(
      panel.querySelectorAll<HTMLElement>(".layer-control-item"),
    ).filter((r) => r.dataset.layerId?.startsWith("layer-"));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(
        row.querySelector<HTMLInputElement>(".layer-control-checkbox")?.checked,
      ).toBe(false);
      expect(
        row.querySelector<HTMLInputElement>(".layer-control-opacity")?.value,
      ).toBe("0.25");
    }
  });
});

describe("removing the control", () => {
  it("takes its map listeners with it", () => {
    const map = makeMap(["layer-0"]);
    const control = new LayerControl({ enableContextMenu: false });
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    control.onAdd(map as any);
    const count = () =>
      Object.values(map.listeners).reduce((n, s) => n + s.size, 0);
    expect(count()).toBeGreaterThan(0);
    control.onRemove();
    expect(count()).toBe(0);
  });

  it("does not pile up listeners when added and removed repeatedly", () => {
    const map = makeMap(["layer-0"]);
    for (let i = 0; i < 5; i++) {
      const control = new LayerControl({ enableContextMenu: false });
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      control.onAdd(map as any);
      control.onRemove();
    }
    expect(map.listeners.styledata?.size ?? 0).toBe(0);
    expect(map.listeners.data?.size ?? 0).toBe(0);
  });
});
