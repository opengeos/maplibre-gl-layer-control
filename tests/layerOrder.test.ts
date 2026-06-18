import { describe, it, expect } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

/**
 * Build a LayerControl wired to a minimal in-memory mock map so the panel
 * rendering order can be exercised without a real MapLibre instance.
 *
 * @param mapOrder Layer IDs in MapLibre array order (index 0 = bottom-most /
 *   rendered first, last index = top-most / rendered last).
 * @param basemapIds IDs that belong to the basemap (grouped under "Background").
 */
function makeControl(mapOrder: string[], basemapIds: string[]) {
  const mockMap = {
    getStyle: () => ({
      layers: mapOrder.map((id) => ({ id, type: "fill", source: id })),
    }),
    getLayer: (id: string) =>
      mapOrder.includes(id) ? { id, type: "fill" } : undefined,
    getLayoutProperty: () => "visible",
    setLayoutProperty: () => {},
    getPaintProperty: () => undefined,
  };

  const control = new LayerControl({
    excludeDrawnLayers: false,
    enableDragAndDrop: false,
    showLayerSymbol: false,
    showStyleEditor: false,
    showOpacitySlider: false,
    enableContextMenu: false,
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  (control as any).panel = document.createElement("div");
  (control as any).basemapLayerIds = new Set(basemapIds);
  (control as any).autoDetectLayers();
  (control as any).buildLayerItems();
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return control;
}

/** Read the rendered panel rows top-to-bottom. */
function renderedOrder(control: LayerControl): string[] {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const panel: HTMLElement = (control as any).panel;
  return Array.from(panel.querySelectorAll(".layer-control-item")).map(
    (el) => (el as HTMLElement).dataset.layerId as string,
  );
}

describe("panel layer order (issue #449)", () => {
  it("renders top-most map layer first and the basemap at the bottom", () => {
    // Map order (bottom -> top): basemap, user-a, user-b, user-c
    const control = makeControl(
      ["osm-basemap", "user-a", "user-b", "user-c"],
      ["osm-basemap"],
    );

    // Panel order (top -> bottom): user-c, user-b, user-a, Background
    expect(renderedOrder(control)).toEqual([
      "user-c",
      "user-b",
      "user-a",
      "Background",
    ]);
  });

  it("keeps the Background group at the bottom with a single user layer", () => {
    const control = makeControl(["bg", "only-user"], ["bg"]);
    expect(renderedOrder(control)).toEqual(["only-user", "Background"]);
  });

  it("renders user layers top-to-bottom when there is no basemap group", () => {
    // basemapIds references a layer absent from the map, so every map layer is
    // treated as user-added and no "Background" group is created.
    const control = makeControl(["user-a", "user-b"], ["absent-basemap"]);
    expect(renderedOrder(control)).toEqual(["user-b", "user-a"]);
  });
});

/**
 * Build a control wired to a mock map whose layer array can be reordered via
 * moveLayer, plus a panel populated with rows in a given top-to-bottom order.
 * Returns helpers to read the resulting map stacking order.
 *
 * @param initialMapOrder Layer IDs in MapLibre array order (index 0 = bottom).
 * @param panelOrder Layer IDs as rendered top-to-bottom in the panel.
 */
function makeReorderControl(initialMapOrder: string[], panelOrder: string[]) {
  let layers = initialMapOrder.map((id) => ({ id, type: "fill" as const }));

  const mockMap = {
    getStyle: () => ({ layers }),
    // MapLibre semantics: moveLayer(id, beforeId) places `id` visually beneath
    // `beforeId`; with no beforeId the layer moves to the end (top).
    moveLayer: (id: string, beforeId?: string) => {
      const item = layers.find((l) => l.id === id);
      if (!item) return;
      layers = layers.filter((l) => l.id !== id);
      if (beforeId === undefined) {
        layers.push(item);
      } else {
        const idx = layers.findIndex((l) => l.id === beforeId);
        layers.splice(idx < 0 ? layers.length : idx, 0, item);
      }
    },
  };

  const control = new LayerControl({ excludeDrawnLayers: false });
  const panel = document.createElement("div");
  for (const id of panelOrder) {
    const item = document.createElement("div");
    item.className = "layer-control-item";
    item.dataset.layerId = id;
    panel.appendChild(item);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  (control as any).panel = panel;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Map order bottom-to-top; reverse to compare against panel (top-to-bottom).
  const mapOrderTopToBottom = () => layers.map((l) => l.id).reverse();
  return { control, mapOrderTopToBottom };
}

describe("drag reorder applies panel order to the map (issue #449)", () => {
  it("keeps the map stack matching an unchanged panel order", () => {
    const { control, mapOrderTopToBottom } = makeReorderControl(
      ["bg", "a", "b", "c"],
      ["c", "b", "a", "Background"],
    );
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).applyUIOrderToMap();
    // Panel top (c) must be the top-most map layer; bg stays at the bottom.
    expect(mapOrderTopToBottom()).toEqual(["c", "b", "a", "bg"]);
  });

  it("moves a layer dragged to the top of the panel to the top of the map", () => {
    const { control, mapOrderTopToBottom } = makeReorderControl(
      ["bg", "a", "b", "c"],
      ["a", "c", "b", "Background"],
    );
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).applyUIOrderToMap();
    // The panel top row "a" must now cover everything beneath it.
    expect(mapOrderTopToBottom()).toEqual(["a", "c", "b", "bg"]);
  });
});

/**
 * Build a control whose user layers are custom-adapter layers (deck.gl / raster
 * style integrations) whose logical IDs differ from the underlying style layer
 * IDs. The adapter maps each logical ID to its native layer(s) so map order can
 * be resolved.
 *
 * @param nativeMapOrder Native style layer IDs, bottom-to-top.
 * @param logicalToNative Logical custom-layer ID -> its native style layer IDs.
 * @param insertionOrder Logical IDs in the order they were added to the state.
 */
function makeCustomControl(
  nativeMapOrder: string[],
  logicalToNative: Record<string, string[]>,
  insertionOrder: string[],
) {
  const mockMap = {
    getStyle: () => ({
      layers: nativeMapOrder.map((id) => ({ id, type: "raster" })),
    }),
    getLayer: (id: string) =>
      nativeMapOrder.includes(id) ? { id, type: "raster" } : undefined,
    getLayoutProperty: () => "visible",
    setLayoutProperty: () => {},
    getPaintProperty: () => undefined,
  };

  const adapter = {
    type: "test",
    getLayerIds: () => insertionOrder,
    getLayerState: (id: string) => ({
      visible: true,
      opacity: 1,
      name: id,
      isCustomLayer: true,
    }),
    setVisibility: () => {},
    setOpacity: () => {},
    getName: (id: string) => id,
    getNativeLayerIds: (id: string) => logicalToNative[id] ?? [],
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const control = new LayerControl({
    excludeDrawnLayers: false,
    customLayerAdapters: [adapter as any],
  });
  (control as any).map = mockMap;
  (control as any).panel = document.createElement("div");
  // Seed the state in the given insertion order, all flagged as custom layers.
  for (const id of insertionOrder) {
    (control as any).state.layerStates[id] = {
      visible: true,
      opacity: 1,
      name: id,
      isCustomLayer: true,
    };
  }
  return {
    control,
    order: () => (control as any).getUserLayerIdsInMapOrder() as string[],
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe("custom-layer order follows the native map stacking (issue #449)", () => {
  it("orders custom layers by their native layer index, not insertion order", () => {
    // Native stacking bottom-to-top: bg, layer-A-raster, layer-B-raster.
    // "A" was added first but sits below "B" on the map, so the panel must
    // still show B (top) above A.
    const { order } = makeCustomControl(
      ["bg", "layer-A-raster", "layer-B-raster"],
      { A: ["layer-A-raster"], B: ["layer-B-raster"] },
      ["A", "B"],
    );
    expect(order()).toEqual(["B", "A"]);
  });

  it("keeps custom layers with no resolvable native layer on top in insertion order", () => {
    const { order } = makeCustomControl(
      ["bg"],
      { A: [], B: [] },
      ["A", "B"],
    );
    expect(order()).toEqual(["A", "B"]);
  });
});
