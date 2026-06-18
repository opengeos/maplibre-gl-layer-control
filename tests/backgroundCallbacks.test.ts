import { describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

/**
 * Build a LayerControl wired to a minimal in-memory mock map so the
 * Background group toggle/opacity handlers can be exercised without a real
 * MapLibre instance. All known layers are treated as basemap layers.
 */
function makeControl(
  options: ConstructorParameters<typeof LayerControl>[0] = {},
) {
  const layerIds = ["water", "roads", "labels"];
  const layoutProps = new Map<string, string>();
  const paintProps = new Map<string, number>();

  const mockMap = {
    getStyle: () => ({
      layers: layerIds.map((id) => ({ id, type: "fill" })),
    }),
    getLayer: (id: string) => ({ id, type: "fill" }),
    getLayoutProperty: (id: string) => layoutProps.get(id) ?? "visible",
    setLayoutProperty: (id: string, _prop: string, value: string) => {
      layoutProps.set(id, value);
    },
    getPaintProperty: (id: string) => paintProps.get(id) ?? 1,
    setPaintProperty: (id: string, _prop: string, value: number) => {
      paintProps.set(id, value);
    },
  };

  const control = new LayerControl(options);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  (control as any).map = mockMap;
  (control as any).panel = document.createElement("div");
  (control as any).basemapLayerIds = new Set(layerIds);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { control, layoutProps };
}

describe("background visibility/opacity callbacks", () => {
  it("fires onBackgroundVisibilityChange when the group is toggled", () => {
    const onBackgroundVisibilityChange = vi.fn();
    const { control, layoutProps } = makeControl({
      onBackgroundVisibilityChange,
    });

    // Simulate the user unchecking the Background group checkbox.
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).toggleBackgroundVisibility(false);

    expect(onBackgroundVisibilityChange).toHaveBeenCalledTimes(1);
    expect(onBackgroundVisibilityChange).toHaveBeenCalledWith(false);
    // The map layers were actually hidden too.
    expect(layoutProps.get("water")).toBe("none");

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).toggleBackgroundVisibility(true);
    expect(onBackgroundVisibilityChange).toHaveBeenLastCalledWith(true);
    expect(onBackgroundVisibilityChange).toHaveBeenCalledTimes(2);
  });

  it("fires onBackgroundOpacityChange when the group opacity changes", () => {
    const onBackgroundOpacityChange = vi.fn();
    const { control } = makeControl({ onBackgroundOpacityChange });

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (control as any).changeBackgroundOpacity(0.4);

    expect(onBackgroundOpacityChange).toHaveBeenCalledTimes(1);
    expect(onBackgroundOpacityChange).toHaveBeenCalledWith(0.4);
  });

  it("does not require the callbacks to be provided", () => {
    const { control } = makeControl();
    expect(() =>
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      (control as any).toggleBackgroundVisibility(false),
    ).not.toThrow();
    expect(() =>
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      (control as any).changeBackgroundOpacity(0.5),
    ).not.toThrow();
  });
});
