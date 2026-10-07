import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

/**
 * Private control members exposed through a typed seam for DOM tests.
 */
type TestableLayerControl = {
  map: unknown;
  state: { activeStyleEditor: string | null };
  styleEditors: Map<string, HTMLElement>;
  createSliderControl(
    container: HTMLElement,
    layerId: string,
    property: string,
    label: string,
    initialValue: number,
    min: number,
    max: number,
    step: number,
  ): void;
  createColorControl(
    container: HTMLElement,
    layerId: string,
    property: string,
    label: string,
    initialValue: string,
  ): void;
  addFillControls(container: HTMLElement, layerId: string): void;
};

/**
 * Build a LayerControl wired to a minimal in-memory mock map.
 */
function makeControl(
  options: ConstructorParameters<typeof LayerControl>[0] = {},
) {
  const paintProps = new Map<string, unknown>();
  const key = (id: string, prop: string) => `${id}::${prop}`;

  const mockMap = {
    getPaintProperty: (id: string, prop: string) =>
      paintProps.get(key(id, prop)),
    setPaintProperty: (id: string, prop: string, value: unknown) => {
      paintProps.set(key(id, prop), value);
    },
    getStyle: () => ({ layers: [] }),
  };

  const control = new LayerControl(options);
  const internals = control as unknown as TestableLayerControl;
  internals.map = mockMap;

  return { control, internals, paintProps, key };
}

describe("onLayerStyleChange callback", () => {
  it("fires when a slider control is changed, reporting the active editor's layer id", () => {
    const onLayerStyleChange = vi.fn();
    const { control, internals, paintProps, key } = makeControl({
      onLayerStyleChange,
    });

    // The editor was opened for the outer layer id, but the slider edits a
    // native sub-layer id internally — the callback must report the outer id.
    internals.state.activeStyleEditor = "geolibre-layer";
    const container = document.createElement("div");
    internals.createSliderControl(
      container,
      "native-primary",
      "raster-brightness-max",
      "Brightness Max",
      1,
      -1,
      1,
      0.05,
    );

    const slider = container.querySelector(
      ".style-control-slider",
    ) as HTMLInputElement;
    slider.value = "0.4";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    // The map was updated...
    expect(paintProps.get(key("native-primary", "raster-brightness-max"))).toBe(
      0.4,
    );
    // ...and the host was notified with the outer layer id, not the native one.
    expect(onLayerStyleChange).toHaveBeenCalledTimes(1);
    expect(onLayerStyleChange).toHaveBeenCalledWith(
      "geolibre-layer",
      "raster-brightness-max",
      0.4,
    );
  });

  it("fires when a color control is changed", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, control } = makeControl({ onLayerStyleChange });

    internals.state.activeStyleEditor = "layer-1";
    const container = document.createElement("div");
    internals.createColorControl(
      container,
      "layer-1",
      "fill-color",
      "Fill Color",
      "#ff0000",
    );

    const picker = container.querySelector(
      ".style-control-color-picker",
    ) as HTMLInputElement;
    picker.value = "#00ff00";
    picker.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onLayerStyleChange).toHaveBeenCalledWith(
      "layer-1",
      "fill-color",
      "#00ff00",
    );
  });

  it("does not throw or notify when no callback is provided", () => {
    const { internals } = makeControl();

    internals.state.activeStyleEditor = "layer-1";
    const container = document.createElement("div");
    internals.createSliderControl(
      container,
      "layer-1",
      "raster-opacity",
      "Opacity",
      1,
      0,
      1,
      0.05,
    );

    const slider = container.querySelector(
      ".style-control-slider",
    ) as HTMLInputElement;
    slider.value = "0.5";
    expect(() =>
      slider.dispatchEvent(new Event("input", { bubbles: true })),
    ).not.toThrow();
  });
});

describe("refreshStyleEditor", () => {
  it("re-reads an open editor's slider from the current map paint", () => {
    const { control, internals, paintProps, key } = makeControl();

    const editor = document.createElement("div");
    internals.state.activeStyleEditor = "layer-1";
    internals.styleEditors.set("layer-1", editor);
    internals.createSliderControl(
      editor,
      "layer-1",
      "raster-brightness-max",
      "Brightness Max",
      1,
      -1,
      1,
      0.05,
    );

    const slider = editor.querySelector(
      ".style-control-slider",
    ) as HTMLInputElement;
    expect(slider.value).toBe("1");

    // An external editor (e.g. a sidebar) writes a new value to the map.
    paintProps.set(key("layer-1", "raster-brightness-max"), 0.3);
    control.refreshStyleEditor("layer-1");

    expect(slider.value).toBe("0.3");
    const display = slider.parentElement?.querySelector(".style-control-value");
    expect(display?.textContent).toBe("0.30");
  });
  it("normalizes refreshed colors and preserves them for invalid map values", () => {
    const { control, internals, paintProps, key } = makeControl();
    const editor = document.createElement("div");
    internals.state.activeStyleEditor = "layer-1";
    internals.styleEditors.set("layer-1", editor);
    internals.createColorControl(
      editor,
      "layer-1",
      "fill-color",
      "Fill Color",
      "#ff0000",
    );
    const picker = editor.querySelector(
      ".style-control-color-picker",
    ) as HTMLInputElement;
    const display = editor.querySelector(
      ".style-control-color-value",
    ) as HTMLInputElement;

    paintProps.set(key("layer-1", "fill-color"), "rebeccapurple");
    control.refreshStyleEditor("layer-1");
    expect(picker.value).toBe("#663399");
    expect(display.value).toBe("#663399");

    paintProps.set(key("layer-1", "fill-color"), "invalid");
    control.refreshStyleEditor("layer-1");
    expect(picker.value).toBe("#663399");
    expect(display.value).toBe("#663399");
  });

  it("is a no-op when the editor is not open", () => {
    const { control } = makeControl();
    expect(() => control.refreshStyleEditor("missing")).not.toThrow();
  });
});

describe("color control initialization", () => {
  it("creates a picker for a valid color and omits it for an invalid color", () => {
    const valid = makeControl();
    valid.paintProps.set(valid.key("layer-1", "fill-color"), "red");
    const validContainer = document.createElement("div");
    valid.internals.addFillControls(validContainer, "layer-1");
    const validPicker = validContainer.querySelector(
      ".style-control-color-picker",
    ) as HTMLInputElement | null;
    expect(validPicker?.value).toBe("#ff0000");

    const invalid = makeControl();
    invalid.paintProps.set(invalid.key("layer-1", "fill-color"), "invalid");
    const invalidContainer = document.createElement("div");
    invalid.internals.addFillControls(invalidContainer, "layer-1");
    expect(
      invalidContainer.querySelector(".style-control-color-picker"),
    ).toBeNull();
  });
});
