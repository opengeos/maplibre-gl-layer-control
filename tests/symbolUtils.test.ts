import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import {
  createLayerSymbolSVG,
  darkenColor,
  getLayerColor,
  getLayerColorFromSpec,
  getLayerSymbolStyle,
  getLayerSymbolStyleFromSpec,
  type FillPatternImage,
} from "../src/lib/utils/symbolUtils";

type ColorLayerType = "fill" | "line" | "circle";

type TestLayer = {
  id: string;
  type: ColorLayerType;
  source: string;
  paint: Record<string, unknown>;
};

function makeColorLayer(
  type: ColorLayerType,
  paint: Record<string, unknown>,
): LayerSpecification {
  const layer: TestLayer = { id: "layer-1", type, source: "source-1", paint };
  return layer as unknown as LayerSpecification;
}

function makeColorMap(
  layer: LayerSpecification,
  runtimePaint: Record<string, unknown> = {},
): MapLibreMap {
  const paint = new Map(Object.entries(runtimePaint));
  const map = {
    getPaintProperty(_layerId: string, property: string) {
      return paint.get(property);
    },
    getStyle() {
      return { layers: [layer] };
    },
  };
  return map as unknown as MapLibreMap;
}

function expectSymbolColor(
  type: ColorLayerType,
  color: string | null,
  expected: string,
): void {
  const container = document.createElement("div");
  container.innerHTML = createLayerSymbolSVG(type, color);
  const selector = type === "line" ? "line" : type === "circle" ? "circle" : "rect";
  const attribute = type === "line" ? "stroke" : "fill";
  expect(container.querySelector(selector)?.getAttribute(attribute)).toBe(expected);
}

describe("layer color symbols", () => {
  it("renders named and functional CSS colors for fill, line, and circle layers", () => {
    const examples: Array<{
      layer: LayerSpecification;
      type: ColorLayerType;
      expected: string;
    }> = [
      { layer: makeColorLayer("fill", { "fill-color": "red" }), type: "fill", expected: "#ff0000" },
      {
        layer: makeColorLayer("line", { "line-color": "hsl(120, 60%, 40%)" }),
        type: "line",
        expected: "#29a329",
      },
      {
        layer: makeColorLayer("circle", { "circle-color": "rebeccapurple" }),
        type: "circle",
        expected: "#663399",
      },
    ];

    for (const { layer, type, expected } of examples) {
      const color = getLayerColorFromSpec(layer);
      expect(color).toBe(expected);
      expect(getLayerColor(makeColorMap(layer), layer.id, type)).toBe(expected);
      expectSymbolColor(type, color, expected);
    }
  });

  it("extracts only result colors from case, match, and interpolate expressions", () => {
    const expressions: Array<{ expression: unknown[]; expected: string }> = [
      {
        expression: ["match", ["get", "category"], "red", "rebeccapurple", "#ff0000"],
        expected: "#663399",
      },
      {
        expression: [
          "case",
          ["==", ["get", "blue"], "red"],
          "rebeccapurple",
          "#ff0000",
        ],
        expected: "#663399",
      },
      {
        expression: [
          "interpolate",
          ["linear"],
          ["get", "red"],
          0,
          "rebeccapurple",
          10,
          "#ff0000",
        ],
        expected: "#663399",
      },
      {
        expression: [
          "case",
          ["==", ["get", "kind"], "blue"],
          ["match", ["get", "category"], "red", "rebeccapurple", "#ff0000"],
          "#00ff00",
        ],
        expected: "#663399",
      },
      {
        expression: [
          "case",
          ["==", ["get", "kind"], "red"],
          "invalid",
          ["==", ["get", "kind"], "blue"],
          "rebeccapurple",
          "#ff0000",
        ],
        expected: "#663399",
      },
    ];

    for (const { expression, expected } of expressions) {
      const layer = makeColorLayer("fill", { "fill-color": expression });
      const color = getLayerColorFromSpec(layer);
      expect(color).toBe(expected);
      expect(getLayerColor(makeColorMap(layer), layer.id, "fill")).toBe(expected);
      expectSymbolColor("fill", color, expected);
    }
  });

  it("continues past invalid runtime and primary colors while preserving precedence", () => {
    const runtimeFallback = makeColorLayer("fill", { "fill-color": "red" });
    expect(
      getLayerColor(
        makeColorMap(runtimeFallback, { "fill-color": "invalid" }),
        runtimeFallback.id,
        "fill",
      ),
    ).toBe("#ff0000");

    const secondaryColor = makeColorLayer("fill", {
      "fill-color": "invalid",
      "fill-outline-color": "rebeccapurple",
    });
    expect(getLayerColorFromSpec(secondaryColor)).toBe("#663399");
    expect(getLayerColor(makeColorMap(secondaryColor), secondaryColor.id, "fill")).toBe(
      "#663399",
    );

    const runtimePrecedence = makeColorLayer("fill", { "fill-color": "red" });
    expect(
      getLayerColor(
        makeColorMap(runtimePrecedence, { "fill-color": "rebeccapurple" }),
        runtimePrecedence.id,
        "fill",
      ),
    ).toBe("#663399");
  });

  it("returns null when no color parses and renders the existing gray fallback", () => {
    const layer = makeColorLayer("fill", {
      "fill-color": "invalid",
      "fill-outline-color": ["case", ["==", ["get", "red"], "blue"], "invalid"],
    });

    expect(getLayerColorFromSpec(layer)).toBeNull();
    expect(getLayerColor(makeColorMap(layer), layer.id, "fill")).toBeNull();
    expectSymbolColor("fill", null, "#888888");
  });
});

/**
 * Builds a map stub with runtime paint values and an optional style fallback.
 */
function makeMap(
  layerType: string,
  runtimePaint: Record<string, unknown>,
  stylePaint: Record<string, unknown> = runtimePaint,
): MapLibreMap {
  const layer = { id: "preview", type: layerType, paint: stylePaint };
  return {
    getPaintProperty: (_layerId: string, property: string) =>
      runtimePaint[property],
    getStyle: () => ({ layers: [layer] }),
  } as unknown as MapLibreMap;
}

describe("createLayerSymbolSVG line styles", () => {
  it("preserves the exact default line SVG when no dasharray is set", () => {
    expect(createLayerSymbolSVG("line", "#7c3aed")).toBe(
      `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <line x1="2" y1="8" x2="14" y2="8"
          stroke="#7c3aed" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
    );
    expect(createLayerSymbolSVG("line", "#7c3aed", { dasharray: [] })).toBe(
      createLayerSymbolSVG("line", "#7c3aed"),
    );
  });

  it("scales a dasharray to fit the preview line", () => {
    const svg = createLayerSymbolSVG("line", "#7c3aed", {
      dasharray: [3, 2],
    });

    expect(svg).toContain('stroke-dasharray="4.5 3"');
    expect(svg).toContain('stroke-linecap="butt"');
  });

  it("does not scale short dash patterns above the preview stroke width", () => {
    const svg = createLayerSymbolSVG("line", "#7c3aed", {
      dasharray: [1, 1],
    });

    expect(svg).toContain('stroke-dasharray="2 2"');
  });
});

describe("createLayerSymbolSVG circle styles", () => {
  it("preserves the default border when no stroke color is set", () => {
    expect(createLayerSymbolSVG("circle", "#14b8a6")).toBe(
      `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="5" fill="#14b8a6"
            stroke="${darkenColor("#14b8a6", 0.3)}" stroke-width="1"/>
  </svg>`,
    );
  });

  it("uses an explicit border color or disables the border", () => {
    const bordered = createLayerSymbolSVG("circle", "#14b8a6", {
      strokeColor: "#ffffff",
    });
    const borderless = createLayerSymbolSVG("circle", "#14b8a6", {
      strokeColor: null,
    });

    expect(bordered).toContain('stroke="#ffffff" stroke-width="1"');
    expect(borderless).toContain('stroke="none"');
    expect(borderless).not.toContain("stroke-width");
  });
});

describe("getLayerSymbolStyle", () => {
  it("extracts the first literal dasharray from runtime expressions", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("line", { "line-dasharray": ["literal", [3, 2]] }),
        "preview",
        "line",
      ),
    ).toEqual({ dasharray: [3, 2] });

    expect(
      getLayerSymbolStyle(
        makeMap("line", {
          "line-dasharray": [
            "step",
            ["zoom"],
            ["literal", [1, 1]],
            10,
            ["literal", [3, 2]],
          ],
        }),
        "preview",
        "line",
      ),
    ).toEqual({ dasharray: [1, 1] });
  });

  it("ignores invalid or all-zero dash patterns", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("line", { "line-dasharray": [0, 0] }),
        "preview",
        "line",
      ),
    ).toEqual({});
    expect(
      getLayerSymbolStyle(
        makeMap("line", { "line-dasharray": [2, -1] }),
        "preview",
        "line",
      ),
    ).toEqual({});
  });

  it("falls back to the style definition for a circle border color", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {}, { "circle-stroke-color": "#ffffff" }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "#ffffff" });
  });

  it("treats a literal zero circle stroke width as no border", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0,
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: null });
  });

  it("does not interpret a stroke-width expression's zoom stop as zero", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0,
            10,
            2,
          ],
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "#ffffff" });
  });

  it("preserves CSS color formats in circle stroke expressions", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": [
            "case",
            true,
            "rgb(255, 255, 255)",
            "#000000",
          ],
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "rgb(255, 255, 255)" });
  });

  it("preserves HSL and alpha-bearing RGBA circle stroke colors", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", { "circle-stroke-color": "hsl(120, 100%, 50%)" }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "hsl(120, 100%, 50%)" });

    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": "rgba(255, 0, 0, 0.5)",
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "rgba(255, 0, 0, 0.5)" });
  });

  it("parses constant rgb and rgba color expressions", () => {
    const rgbStyle = getLayerSymbolStyle(
      makeMap("circle", { "circle-stroke-color": ["rgb", 255, 0, 0] }),
      "preview",
      "circle",
    );
    const rgbaStyle = getLayerSymbolStyle(
      makeMap("circle", {
        "circle-stroke-color": ["rgba", 255, 0, 0, 0.5],
      }),
      "preview",
      "circle",
    );

    expect(rgbStyle).toEqual({ strokeColor: "rgb(255, 0, 0)" });
    expect(rgbaStyle).toEqual({ strokeColor: "rgba(255, 0, 0, 0.5)" });
    expect(createLayerSymbolSVG("circle", "#14b8a6", rgbaStyle)).toContain(
      'stroke="rgba(255, 0, 0, 0.5)" stroke-width="1"',
    );
  });
});

describe("getLayerSymbolStyleFromSpec", () => {
  it("resolves the line dasharray from a layer specification", () => {
    expect(
      getLayerSymbolStyleFromSpec({
        id: "rail",
        type: "line",
        source: "rail-source",
        paint: {
          "line-color": "#7c3aed",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      }),
    ).toEqual({ dasharray: [3, 2] });
  });
});

function image(alpha: number[], sdf = true): FillPatternImage {
  const data = new Uint8Array(alpha.length * 4);
  alpha.forEach((value, i) => data.set([10, 20, 30, value], i * 4));
  return { data: { width: alpha.length, height: 1, data }, sdf, pixelRatio: 1, version: 0 };
}

function captureTile() {
  let pixels = new Uint8ClampedArray();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (value: ImageData) => { pixels = value.data; },
  } as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;base64,${pixels.join(',')}`);
  return { pixels: () => Array.from(pixels) };
}

afterEach(() => vi.restoreAllMocks());

describe('fill pattern tiles', () => {
  it('decodes the SDF contour rather than treating distance as opacity', () => {
    const tile = captureTile();
    createLayerSymbolSVG('fill', '#f08', { fillPattern: image([0, 128, 191, 255]) });
    const pixels = tile.pixels();
    expect(pixels.slice(0, 8)).toEqual([255, 0, 136, 0, 255, 0, 136, 0]);
    expect(pixels[11]).toBeGreaterThan(120);
    expect(pixels[11]).toBeLessThan(135);
    expect(pixels.slice(12)).toEqual([255, 0, 136, 255]);
  });

  it('preserves the original colours and alpha of non-SDF patterns', () => {
    const tile = captureTile();
    createLayerSymbolSVG('fill', '#ff0088', { fillPattern: image([64, 255], false) });
    expect(tile.pixels()).toEqual([10, 20, 30, 64, 10, 20, 30, 255]);
  });

  it('invalidates cached pixels after an image update and separates SDF tints', () => {
    const tile = captureTile();
    const pattern = image([255]);
    createLayerSymbolSVG('fill', '#ff0000', { fillPattern: pattern });
    createLayerSymbolSVG('fill', '#00ff00', { fillPattern: pattern });
    expect(tile.pixels()).toEqual([0, 255, 0, 255]);
    pattern.data.data[3] = 0;
    pattern.version = 1;
    createLayerSymbolSVG('fill', '#ff0000', { fillPattern: pattern });
    expect(tile.pixels()).toEqual([255, 0, 0, 0]);
  });
});

describe('representative pattern resolution', () => {
  const pattern = image([255]);
  const makeMap = (value: unknown) => ({
    getPaintProperty: () => value,
    getImage: (id: string) => ['stripes', 'label'].includes(id) ? pattern : undefined,
    getStyle: () => ({ layers: [] }),
  }) as unknown as MapLibreMap;

  it('does not mistake a registered match label for an output image', () => {
    const map = makeMap(['match', ['get', 'kind'], 'label', 'missing', 'stripes']);
    expect(getLayerSymbolStyle(map, 'area', 'fill').fillPattern).toBe(pattern);
    const labelsOnly = makeMap(['match', ['get', 'kind'], 'label', 'missing', 'also-missing']);
    expect(getLayerSymbolStyle(labelsOnly, 'area', 'fill').fillPattern).toBeUndefined();
  });

  it('uses available image outputs and leaves dynamic feature lookups unresolved', () => {
    const map = makeMap(['coalesce', ['image', 'missing'], ['image', 'stripes']]);
    expect(getLayerSymbolStyle(map, 'area', 'fill').fillPattern).toBe(pattern);
    expect(getLayerSymbolStyle(makeMap(['get', 'stripes']), 'area', 'fill').fillPattern).toBeUndefined();
  });

  it('uses the style definition only when runtime paint is absent', () => {
    const map = makeMap(undefined);
    map.getStyle = (() => ({ layers: [{ id: 'area', type: 'fill', paint: { 'fill-pattern': 'stripes' } }] })) as MapLibreMap['getStyle'];
    expect(getLayerSymbolStyle(map, 'area', 'fill').fillPattern).toBe(pattern);
    map.getPaintProperty = () => '';
    expect(getLayerSymbolStyle(map, 'area', 'fill').fillPattern).toBeUndefined();
  });
});
