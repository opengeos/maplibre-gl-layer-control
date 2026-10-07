import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";
import type {
  CustomLayerAdapter,
  LayerGroupState,
} from "../src/lib/core/types";

interface FakeLayer {
  id: string;
  groupId?: string;
}

/**
 * Build a LayerControl over an empty mock map whose layers all come from one
 * custom adapter, so the grouped panel can be exercised without MapLibre.
 *
 * @param layers Custom layers bottom-to-top. None has a native layer on the
 *   mock map, so the control stacks them in adapter order, which it reads
 *   top-to-bottom; the adapter therefore lists them reversed.
 * @param groups Groups the adapter defines.
 * @param options Extra control options.
 */
function makeControl(
  layers: FakeLayer[],
  groups: LayerGroupState[],
  options: { onLayerReorder?: (order: string[]) => void } = {},
) {
  const adapter: CustomLayerAdapter = {
    type: "test",
    getLayerIds: () => layers.map((layer) => layer.id).reverse(),
    getLayerState: (id) => ({ visible: true, opacity: 1, name: id }),
    setVisibility: vi.fn(),
    setOpacity: vi.fn(),
    getName: (id) => id,
    getGroups: () => groups,
    getLayerGroupId: (id) => layers.find((layer) => layer.id === id)?.groupId,
    setGroupVisibility: vi.fn(),
    setGroupOpacity: vi.fn(),
    setGroupCollapsed: vi.fn(),
  };

  const mockMap = {
    getStyle: () => ({ layers: [] }),
    getLayer: () => undefined,
    moveLayer: vi.fn(),
  };

  const control = new LayerControl({
    excludeDrawnLayers: false,
    showLayerSymbol: false,
    showStyleEditor: false,
    customLayerAdapters: [adapter],
    onLayerReorder: options.onLayerReorder,
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  (control as any).panel = document.createElement("div");
  (control as any).checkForNewLayers();
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { control, adapter };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const panelOf = (control: LayerControl): HTMLElement => (control as any).panel;

/**
 * Describe the panel's tree: layer rows as their ID and groups as
 * `{ group: children }`, top-to-bottom.
 */
function tree(element: Element): unknown[] {
  return Array.from(element.children).flatMap((child) => {
    const el = child as HTMLElement;
    if (el.classList.contains("layer-control-item")) return [el.dataset.layerId];
    if (el.classList.contains("layer-control-group")) {
      const children = el.querySelector(":scope > .layer-control-group-children")!;
      return [{ [el.dataset.groupId as string]: tree(children) }];
    }
    return [];
  });
}

const group = (
  id: string,
  extra: Partial<LayerGroupState> = {},
): LayerGroupState => ({
  id,
  name: id.toUpperCase(),
  visible: true,
  opacity: 1,
  collapsed: false,
  ...extra,
});

describe("layer groups", () => {
  it("renders a flat panel when the adapter defines no groups", () => {
    const { control } = makeControl([{ id: "a" }, { id: "b" }], []);
    expect(tree(panelOf(control))).toEqual(["b", "a"]);
    expect(panelOf(control).querySelector(".layer-control-group")).toBeNull();
  });

  it("nests layers under their (nested) groups in stacking order", () => {
    const { control } = makeControl(
      [
        { id: "bottom" },
        { id: "g1", groupId: "outer" },
        { id: "n1", groupId: "inner" },
        { id: "n2", groupId: "inner" },
        { id: "g2", groupId: "outer" },
        { id: "top" },
      ],
      [group("outer"), group("inner", { parentId: "outer" })],
    );

    expect(tree(panelOf(control))).toEqual([
      "top",
      { outer: ["g2", { inner: ["n2", "n1"] }, "g1"] },
      "bottom",
    ]);
  });

  it("omits groups with no layers and ignores unknown group IDs", () => {
    const { control } = makeControl(
      [{ id: "a", groupId: "missing" }, { id: "b", groupId: "g" }],
      [group("g"), group("empty")],
    );
    expect(tree(panelOf(control))).toEqual([{ g: ["b"] }, "a"]);
  });

  it("survives a parent cycle without hanging", () => {
    const { control } = makeControl(
      [{ id: "a", groupId: "x" }],
      [group("x", { parentId: "y" }), group("y", { parentId: "x" })],
    );
    expect(panelOf(control).querySelectorAll(".layer-control-item")).toHaveLength(1);
  });

  it("shows group state and reports group edits to the adapter", () => {
    const { control, adapter } = makeControl(
      [{ id: "a", groupId: "g" }],
      [group("g", { visible: false, opacity: 0.4, collapsed: true })],
    );
    const element = panelOf(control).querySelector(".layer-control-group") as HTMLElement;
    const checkbox = element.querySelector(".layer-control-group-checkbox") as HTMLInputElement;
    const slider = element.querySelector(".layer-control-group-opacity") as HTMLInputElement;
    const toggle = element.querySelector(".layer-control-group-toggle") as HTMLButtonElement;

    expect(checkbox.checked).toBe(false);
    expect(slider.value).toBe("0.4");
    expect(element.classList.contains("collapsed")).toBe(true);
    expect(element.classList.contains("layer-control-group-hidden")).toBe(true);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(adapter.setGroupVisibility).toHaveBeenCalledWith("g", true);
    expect(element.classList.contains("layer-control-group-hidden")).toBe(false);

    slider.value = "0.7";
    slider.dispatchEvent(new Event("input"));
    expect(adapter.setGroupOpacity).toHaveBeenCalledWith("g", 0.7);

    toggle.click();
    expect(adapter.setGroupCollapsed).toHaveBeenCalledWith("g", false);
    expect(element.classList.contains("collapsed")).toBe(false);
  });

  it("double-clicking a group's opacity slider opens the exact-value input", () => {
    const { control, adapter } = makeControl(
      [{ id: "a", groupId: "g" }],
      [group("g", { opacity: 0.8 })],
    );
    const mapContainer = document.createElement("div");
    document.body.appendChild(mapContainer);
    // mapContainer is private and unset here because no map is attached
    const internals = control as unknown as { mapContainer: HTMLElement };
    internals.mapContainer = mapContainer;

    const slider = panelOf(control).querySelector(
      ".layer-control-group-opacity",
    ) as HTMLInputElement;
    slider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    const input = mapContainer.querySelector(
      ".layer-control-opacity-input input",
    ) as HTMLInputElement;
    expect(input.value).toBe("80");

    input.value = "40";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(adapter.setGroupOpacity).toHaveBeenCalledWith("g", 0.4);
    expect(slider.value).toBe("0.4");
    expect(mapContainer.querySelector(".layer-control-opacity-input")).toBeNull();
    mapContainer.remove();
  });

  it("refreshGroups updates rows in place and rebuilds on structural change", () => {
    const layers: FakeLayer[] = [{ id: "a", groupId: "g" }, { id: "b" }];
    const groups = [group("g")];
    const { control } = makeControl(layers, groups);
    const before = panelOf(control).querySelector(".layer-control-group");

    groups[0] = group("g", { name: "Renamed", visible: false });
    control.refreshGroups();
    const same = panelOf(control).querySelector(".layer-control-group")!;
    expect(same).toBe(before);
    expect(same.querySelector(".layer-control-group-name")!.textContent).toBe("Renamed");
    expect(
      (same.querySelector(".layer-control-group-checkbox") as HTMLInputElement).checked,
    ).toBe(false);

    layers[1].groupId = "g";
    control.refreshGroups();
    expect(tree(panelOf(control))).toEqual([{ g: ["b", "a"] }]);
  });

  it("keeps context-menu moves inside the layer's group", () => {
    const onLayerReorder = vi.fn();
    const { control } = makeControl(
      [
        { id: "a" },
        { id: "g1", groupId: "g" },
        { id: "g2", groupId: "g" },
        { id: "b" },
      ],
      [group("g")],
      { onLayerReorder },
    );
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Already the top of its group: moving up must not leave the group.
    (control as any).moveLayerUp("g2");
    expect(onLayerReorder).not.toHaveBeenCalled();

    (control as any).moveLayerToTop("g1");
    expect(onLayerReorder).toHaveBeenLastCalledWith(["b", "g1", "g2", "a"]);

    // Ungrouped layers step past the whole group as one block, never into it.
    (control as any).moveLayerDown("b");
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(onLayerReorder).toHaveBeenLastCalledWith(["g1", "g2", "b", "a"]);
  });

  it("moves a layer past a nested group as one block", () => {
    const onLayerReorder = vi.fn();
    const { control } = makeControl(
      [
        { id: "g1", groupId: "g" },
        { id: "s1", groupId: "sub" },
        { id: "s2", groupId: "sub" },
      ],
      [group("g"), group("sub", { parentId: "g" })],
      { onLayerReorder },
    );
    expect(tree(panelOf(control))).toEqual([{ g: [{ sub: ["s2", "s1"] }, "g1"] }]);

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).moveLayerUp("g1");
    expect(onLayerReorder).toHaveBeenLastCalledWith(["g1", "s2", "s1"]);
    expect(tree(panelOf(control))).toEqual([{ g: ["g1", { sub: ["s2", "s1"] }] }]);
  });

  it("prunes a group whose last layer was removed", () => {
    const layers: FakeLayer[] = [{ id: "a", groupId: "g" }, { id: "b" }];
    const { control } = makeControl(layers, [group("g")]);
    layers.splice(0, 1);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).checkForNewLayers();
    expect(tree(panelOf(control))).toEqual(["b"]);
  });
});
