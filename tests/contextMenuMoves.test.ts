import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";
import type { CustomLayerAdapter } from "../src/lib/core/types";

/**
 * Build a control over two ungrouped custom layers whose native layers are on
 * the map (bottom to top: a-native, b-native), so the panel lists b above a.
 * The control leaves restacking custom layers to the adapter, so the map
 * order stays put after a move.
 */
function makeControl(onLayerReorder: (order: string[]) => void) {
  const adapter: CustomLayerAdapter = {
    type: "test",
    getLayerIds: () => ["a", "b"],
    getLayerState: (id) => ({ visible: true, opacity: 1, name: id }),
    setVisibility: vi.fn(),
    setOpacity: vi.fn(),
    getName: (id) => id,
    getNativeLayerIds: (id) => [`${id}-native`],
  };
  const mapOrder = ["a-native", "b-native"];
  const mockMap = {
    getStyle: () => ({ layers: mapOrder.map((id) => ({ id, type: "fill" })) }),
    getLayer: (id: string) => (mapOrder.includes(id) ? { id, type: "fill" } : undefined),
    moveLayer: vi.fn(),
  };

  const control = new LayerControl({
    excludeDrawnLayers: false,
    excludeLayers: ["*-native"],
    showLayerSymbol: false,
    showStyleEditor: false,
    customLayerAdapters: [adapter],
    onLayerReorder,
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  (control as any).panel = document.createElement("div");
  (control as any).checkForNewLayers();
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return control;
}

describe("context-menu moves without groups", () => {
  it.each([
    ["moveLayerUp", "a"],
    ["moveLayerToTop", "a"],
    ["moveLayerDown", "b"],
    ["moveLayerToBottom", "b"],
  ])("%s reports the requested order for a custom layer", (method, layerId) => {
    const onLayerReorder = vi.fn();
    const control = makeControl(onLayerReorder);

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any)[method](layerId);

    // Panel order was [b, a]; every move swaps the two.
    expect(onLayerReorder).toHaveBeenCalledWith(["a", "b"]);
  });
});
