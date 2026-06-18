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
