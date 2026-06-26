import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

/**
 * Build a LayerControl wired to a minimal in-memory mock map so the per-layer
 * style-editor controls can be exercised without a real MapLibre instance.
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
  };

  const control = new LayerControl(options);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { control, paintProps, key };
}

describe("onLayerStyleChange callback", () => {
  it("fires when a slider control is changed, reporting the active editor's layer id", () => {
    const onLayerStyleChange = vi.fn();
    const { control, paintProps, key } = makeControl({ onLayerStyleChange });

    // The editor was opened for the outer layer id, but the slider edits a
    // native sub-layer id internally — the callback must report the outer id.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (control as any).state.activeStyleEditor = "geolibre-layer";
    const container = document.createElement("div");
    (control as any).createSliderControl(
      container,
      "native-primary",
      "raster-brightness-max",
      "Brightness Max",
      1,
      -1,
      1,
      0.05,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

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
    const { control } = makeControl({ onLayerStyleChange });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    (control as any).state.activeStyleEditor = "layer-1";
    const container = document.createElement("div");
    (control as any).createColorControl(
      container,
      "layer-1",
      "fill-color",
      "Fill Color",
      "#ff0000",
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

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
    const { control } = makeControl();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    (control as any).state.activeStyleEditor = "layer-1";
    const container = document.createElement("div");
    (control as any).createSliderControl(
      container,
      "layer-1",
      "raster-opacity",
      "Opacity",
      1,
      0,
      1,
      0.05,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

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
    const { control, paintProps, key } = makeControl();

    const editor = document.createElement("div");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (control as any).state.activeStyleEditor = "layer-1";
    (control as any).styleEditors.set("layer-1", editor);
    (control as any).createSliderControl(
      editor,
      "layer-1",
      "raster-brightness-max",
      "Brightness Max",
      1,
      -1,
      1,
      0.05,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

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

  it("is a no-op when the editor is not open", () => {
    const { control } = makeControl();
    expect(() => control.refreshStyleEditor("missing")).not.toThrow();
  });
});
