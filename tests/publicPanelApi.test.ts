import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

type Options = ConstructorParameters<typeof LayerControl>[0];

/**
 * Add a LayerControl to a minimal mock map through its real `onAdd`, so the
 * public API is exercised the way an application uses it.
 *
 * @param layerIds Style layer IDs, bottom-most first.
 * @param options LayerControl options.
 * @returns The mounted control, its map container and a spy for map writes.
 */
function mount(layerIds: string[], options: Options = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const setLayoutProperty = vi.fn();
  const setPaintProperty = vi.fn();
  const map = {
    getContainer: () => container,
    getStyle: () => ({
      sources: Object.fromEntries(
        layerIds.map((id) => [id, { type: "geojson" }]),
      ),
      layers: layerIds.map((id) => ({ id, type: "fill", source: id })),
    }),
    getLayer: (id: string) =>
      layerIds.includes(id) ? { id, type: "fill", source: id } : undefined,
    getLayoutProperty: () => "visible",
    getPaintProperty: () => 1,
    setLayoutProperty,
    setPaintProperty,
    on: () => map,
    off: () => map,
    once: () => map,
  };
  const control = new LayerControl({
    showStyleEditor: false,
    enableContextMenu: false,
    enableDragAndDrop: false,
    showLayerSymbol: false,
    ...options,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control.onAdd(map as any);
  return { control, container, setLayoutProperty, setPaintProperty };
}

/** The panel's row IDs, top to bottom. */
function rows(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".layer-control-item"),
  ).map((item) => item.dataset.layerId as string);
}

/** One row's rendered checkbox, opacity and name. */
function row(container: HTMLElement, layerId: string) {
  const item = container.querySelector<HTMLElement>(
    `.layer-control-item[data-layer-id="${layerId}"]`,
  )!;
  return {
    checked: item.querySelector<HTMLInputElement>(".layer-control-checkbox")!
      .checked,
    opacity: item.querySelector<HTMLInputElement>(".layer-control-opacity")!
      .value,
    name: item.querySelector<HTMLElement>(".layer-control-name")!.textContent,
  };
}

describe("basemapLayerIds option", () => {
  it("groups exactly the listed layers under Background", () => {
    const { container } = mount(["water", "roads", "user-a"], {
      basemapLayerIds: ["water", "roads"],
    });
    expect(rows(container)).toEqual(["user-a", "Background"]);
  });

  it("treats every layer as user-added when the list is empty", () => {
    const { container } = mount(["water", "user-a"], { basemapLayerIds: [] });
    expect(rows(container)).toEqual(["user-a", "water"]);
  });

  it("does not fetch basemapStyleUrl when IDs are given", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      mount(["water"], {
        basemapLayerIds: ["water"],
        basemapStyleUrl: "https://example.com/style.json",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("setLayerState", () => {
  it("updates a row in place without writing to the map", () => {
    const { control, container, setLayoutProperty, setPaintProperty } = mount(
      ["base", "user-a"],
      { basemapLayerIds: ["base"] },
    );
    const before = container.querySelector('[data-layer-id="user-a"]');

    expect(
      control.setLayerState("user-a", {
        visible: false,
        opacity: 0.25,
        name: "Roads",
      }),
    ).toBe(true);

    expect(row(container, "user-a")).toEqual({
      checked: false,
      opacity: "0.25",
      name: "Roads",
    });
    expect(container.querySelector('[data-layer-id="user-a"]')).toBe(before);
    expect(setLayoutProperty).not.toHaveBeenCalled();
    expect(setPaintProperty).not.toHaveBeenCalled();
  });

  it("keeps fields that are not passed", () => {
    const { control, container } = mount(["base", "user-a"], {
      basemapLayerIds: ["base"],
    });
    control.setLayerState("user-a", { opacity: 0.5 });
    expect(row(container, "user-a").checked).toBe(true);
    expect(row(container, "user-a").opacity).toBe("0.5");
  });

  it("ignores layers the control does not list", () => {
    const { control, container } = mount(["base", "user-a"], {
      basemapLayerIds: ["base"],
    });
    expect(control.setLayerState("missing", { visible: false })).toBe(false);
    expect(rows(container)).toEqual(["user-a", "Background"]);
  });

  it("adds a Background row when the style has no basemap layers", () => {
    const { control, container } = mount(["user-a"], { basemapLayerIds: [] });
    expect(rows(container)).toEqual(["user-a"]);

    expect(
      control.setLayerState("Background", { visible: false, opacity: 0.4 }),
    ).toBe(true);

    expect(rows(container)).toEqual(["user-a", "Background"]);
    expect(row(container, "Background")).toMatchObject({
      checked: false,
      opacity: "0.4",
    });
  });

  it("does nothing before the control is added to a map", () => {
    const control = new LayerControl({});
    expect(control.setLayerState("Background", { visible: false })).toBe(false);
  });
});

describe("setLayerState timing and names", () => {
  it("queues a Background update until basemapStyleUrl detection finishes", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
    );
    try {
      const { control, container } = mount(["user-a"], {
        basemapStyleUrl: "https://example.com/style.json",
      });
      expect(control.setLayerState("Background", { visible: false })).toBe(
        true,
      );
      expect(control.setLayerState("Background", { opacity: 0.3 })).toBe(true);
      expect(rows(container)).toEqual([]);

      // The queued update applies once the fetch completes.
      resolveFetch({ ok: true, json: async () => ({ layers: [] }) });
      await vi.waitFor(() => expect(rows(container)).toContain("Background"));
      expect(row(container, "Background")).toMatchObject({
        checked: false,
        opacity: "0.3",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("replaces a cached context-menu rename", () => {
    const { control, container } = mount(["base", "user-a"], {
      basemapLayerIds: ["base"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (control as any).state.customLayerNames.set("user-a", "Old");
    control.setLayerState("user-a", { name: "New" });
    control.setLayerOrder([]);
    expect(row(container, "user-a").name).toBe("New");
  });
});

describe("setLayerOrder", () => {
  it("orders layers with nothing on the map and keeps Background last", () => {
    const ids = ["a", "b", "c"];
    const { control, container } = mount(["base"], {
      basemapLayerIds: ["base"],
      customLayerAdapters: [
        {
          type: "app",
          getLayerIds: () => ids,
          getLayerState: (id: string) => ({
            visible: false,
            opacity: 1,
            name: id.toUpperCase(),
          }),
          setVisibility: () => {},
          setOpacity: () => {},
          getName: (id: string) => id.toUpperCase(),
        },
      ],
    });
    expect(rows(container)).toEqual(["a", "b", "c", "Background"]);

    control.setLayerOrder(["c", "a"]);

    expect(rows(container)).toEqual(["c", "a", "b", "Background"]);
  });

  it("keeps the order of integer-like IDs", () => {
    const ids = ["1", "2"];
    const { control, container } = mount(["base"], {
      basemapLayerIds: ["base"],
      customLayerAdapters: [
        {
          type: "app",
          getLayerIds: () => ids,
          getLayerState: (id: string) => ({
            visible: false,
            opacity: 1,
            name: id,
          }),
          setVisibility: () => {},
          setOpacity: () => {},
          getName: (id: string) => id,
        },
      ],
    });
    control.setLayerOrder(["2", "1"]);
    expect(rows(container)).toEqual(["2", "1", "Background"]);
  });
});

describe("isCollapsed / expand / collapse", () => {
  it("reports and changes the panel state", () => {
    const { control, container } = mount(["base"], {
      basemapLayerIds: ["base"],
    });
    const panel = container.querySelector(".layer-control-panel")!;
    expect(control.isCollapsed()).toBe(true);

    control.expand();
    expect(control.isCollapsed()).toBe(false);
    expect(panel.classList.contains("expanded")).toBe(true);

    control.collapse();
    expect(control.isCollapsed()).toBe(true);
    expect(panel.classList.contains("expanded")).toBe(false);
  });

  it("reflects the collapsed option before mounting", () => {
    expect(new LayerControl({ collapsed: false }).isCollapsed()).toBe(false);
    const control = new LayerControl({});
    control.expand();
    expect(control.isCollapsed()).toBe(false);
  });
});
