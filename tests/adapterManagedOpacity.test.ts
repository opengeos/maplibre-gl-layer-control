import { describe, it, expect } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";
import type { CustomLayerAdapter, LayerState } from "../src/lib/core/types";

/** Private control members exposed through a typed seam. */
type TestableLayerControl = {
  map: unknown;
  panel: HTMLElement;
  state: { layerStates: Record<string, LayerState> };
  autoDetectLayers(): void;
  buildLayerItems(): void;
  updateLayerStatesFromMap(): void;
  addFillControls(container: HTMLElement, layerId: string): void;
  syncStyleEditorControlsFromMap(editor: HTMLElement): void;
};

/**
 * A control over a native map layer ("child") that an adapter manages inside a
 * folder. Like the full demo's adapter, it keeps the layer's own opacity and
 * writes `own × folder` to the map's paint property.
 */
function makeControl(
  own: number,
  folder: number,
  options: { showAllStyleProperties?: boolean; mapHidden?: boolean } = {},
) {
  const paint = new Map<string, number>();
  const layer: LayerState = { visible: true, opacity: own, name: "Child" };
  const folderState = { opacity: folder };

  const apply = () => paint.set("fill-opacity", layer.opacity * folderState.opacity);
  apply();

  const adapter: CustomLayerAdapter = {
    type: "test",
    getLayerIds: () => ["child"],
    getLayerState: () => ({ ...layer }),
    setVisibility: () => {},
    setOpacity: (_id, opacity) => {
      layer.opacity = opacity;
      apply();
    },
    getName: () => "Child",
    getGroups: () => [
      { id: "folder", name: "Folder", visible: true, opacity: folderState.opacity, collapsed: false },
    ],
    getLayerGroupId: () => "folder",
    setGroupOpacity: (_id, opacity) => {
      folderState.opacity = opacity;
      apply();
    },
  };

  const mockMap = {
    getStyle: () => ({ layers: [{ id: "child", type: "fill" }] }),
    getLayer: () => ({ id: "child", type: "fill" }),
    getLayoutProperty: () => (options.mapHidden ? "none" : undefined),
    getPaintProperty: (_id: string, prop: string) => paint.get(prop),
    setPaintProperty: (_id: string, prop: string, value: number) => {
      paint.set(prop, value);
    },
  };

  const control = new LayerControl({
    excludeDrawnLayers: false,
    showLayerSymbol: false,
    showStyleEditor: false,
    showAllStyleProperties: options.showAllStyleProperties,
    layers: ["child"],
    customLayerAdapters: [adapter],
  });

  const internals = control as unknown as TestableLayerControl;
  internals.map = mockMap;
  internals.panel = document.createElement("div");
  internals.autoDetectLayers();
  internals.buildLayerItems();

  const slider = () =>
    internals.panel.querySelector(".layer-control-opacity:not(.layer-control-group-opacity)") as HTMLInputElement;
  return { internals, adapter, paint, slider };
}

describe("adapter-managed native layers inside a folder", () => {
  it("keeps the row slider at the layer's own opacity after a map sync", () => {
    const { internals, adapter, paint, slider } = makeControl(0.5, 1);
    expect(slider().value).toBe("0.5");

    adapter.setGroupOpacity!("folder", 0.5);
    expect(paint.get("fill-opacity")).toBe(0.25);

    internals.updateLayerStatesFromMap();
    expect(slider().value).toBe("0.5");
    expect(internals.state.layerStates.child.opacity).toBe(0.5);

    // A second folder change must not compound.
    adapter.setGroupOpacity!("folder", 0.5);
    internals.updateLayerStatesFromMap();
    expect(slider().value).toBe("0.5");
    expect(paint.get("fill-opacity")).toBe(0.25);
  });

  it("seeds the row slider from the adapter, not the folded paint value", () => {
    const { slider } = makeControl(0.5, 0.5);
    expect(slider().value).toBe("0.5");
  });

  it("routes a style editor opacity edit through the adapter", () => {
    const { internals, paint, slider } = makeControl(0.5, 0.5);
    const container = document.createElement("div");
    internals.addFillControls(container, "child");

    const editorSlider = container.querySelector<HTMLInputElement>(
      '.style-control-slider[data-property="fill-opacity"]',
    )!;
    expect(editorSlider.value).toBe("0.5");

    editorSlider.value = "0.8";
    editorSlider.dispatchEvent(new Event("input"));
    expect(paint.get("fill-opacity")).toBeCloseTo(0.4);
    expect(slider().value).toBe("0.8");

    internals.updateLayerStatesFromMap();
    expect(slider().value).toBe("0.8");
    expect(internals.state.layerStates.child.opacity).toBe(0.8);
  });

  it("keeps managed editor sliders at the layer's own opacity on refresh", () => {
    const { internals, adapter } = makeControl(0.5, 1, {
      showAllStyleProperties: true,
    });
    const container = document.createElement("div");
    internals.addFillControls(container, "child");
    const editorSlider = container.querySelector<HTMLInputElement>(
      '.style-control-slider[data-property="fill-opacity"]',
    )!;

    adapter.setGroupOpacity!("folder", 0.5);
    internals.syncStyleEditorControlsFromMap(container);
    expect(editorSlider.value).toBe("0.5");
  });

  it("keeps the row checked when only the folder hides the layer on the map", () => {
    const { internals } = makeControl(0.5, 1, { mapHidden: true });
    internals.updateLayerStatesFromMap();
    const checkbox = internals.panel.querySelector<HTMLInputElement>(
      ".layer-control-item .layer-control-checkbox",
    )!;
    expect(internals.state.layerStates.child.visible).toBe(true);
    expect(checkbox.checked).toBe(true);
  });
});
