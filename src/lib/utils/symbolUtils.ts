import type { Map as MapLibreMap, LayerSpecification, AllPaintProperties } from 'maplibre-gl';
import { normalizeColor, rgbToHex } from './colorUtils';

/**
 * Map of layer types to their primary color property
 */
const COLOR_PROPERTY_MAP: Record<string, (keyof AllPaintProperties)[]> = {
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
  circle: ['circle-color', 'circle-stroke-color'],
  symbol: ['icon-color', 'text-color'],
  background: ['background-color'],
  heatmap: ['heatmap-color'],
  'fill-extrusion': ['fill-extrusion-color'],
};

/**
 * Narrows an unknown expression value to an array
 * @param value Value to check
 * @returns Whether the value is an array
 */
function isExpressionArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Extract the first color value from a MapLibre expression
 * Handles expressions like ['case', ...], ['match', ...], ['interpolate', ...],
 * and constant ['rgb', ...] / ['rgba', ...] operators
 * @param expression The MapLibre expression to extract color from
 * @param preserveFormat Keep CSS color syntax instead of normalizing to hex
 * @returns The first color found, or null
 */
function extractColorFromExpression(
  expression: unknown,
  preserveFormat = false
): string | null {
  if (!isExpressionArray(expression) || expression.length === 0) return null;

  const operator = expression[0];
  const components = expression.slice(1);
  if (
    (operator === 'rgb' && components.length === 3) ||
    (operator === 'rgba' && components.length === 4)
  ) {
    if (
      components.every(
        (component) =>
          typeof component === 'number' && Number.isFinite(component)
      )
    ) {
      const color = `${operator}(${components.join(', ')})`;
      return preserveFormat ? color : normalizeColor(color);
    }
  }

  let index = 0;
  let stride = 1;
  let end = expression.length;
  let fallbackIndex = -1;
  let firstResultIndex = 0;

  if (operator === 'case' || operator === 'match') {
    firstResultIndex = operator === 'case' ? 2 : 3;
    index = firstResultIndex;
    stride = 2;
    end = expression.length - 1;
    fallbackIndex = expression.length - 1;
  } else if (operator === 'interpolate') {
    index = 4;
    stride = 2;
  }

  const resolve = (item: unknown): string | null => {
    if (typeof item === 'string') {
      const color = normalizeColor(item);
      return color !== null && preserveFormat ? item : color;
    }
    return isExpressionArray(item)
      ? extractColorFromExpression(item, preserveFormat)
      : null;
  };

  for (; index < end; index += stride) {
    const color = resolve(expression[index]);
    if (color !== null) return color;
  }

  if (fallbackIndex >= firstResultIndex) {
    return resolve(expression[fallbackIndex]);
  }

  return null;
}

/**
 * Get the primary color from a layer's paint properties
 * @param map The MapLibre map instance
 * @param layerId The layer ID
 * @param layerType The layer type
 * @returns The normalized hex color, or null if not found
 */
export function getLayerColor(
  map: MapLibreMap,
  layerId: string,
  layerType: string
): string | null {
  const propertyNames = COLOR_PROPERTY_MAP[layerType];
  if (!propertyNames) return null;

  for (const propertyName of propertyNames) {
    try {
      const runtimeColor = map.getPaintProperty(layerId, propertyName);
      if (runtimeColor) {
        if (typeof runtimeColor === 'string') {
          const color = normalizeColor(runtimeColor);
          if (color !== null) return color;
        }
        if (Array.isArray(runtimeColor)) {
          const extracted = extractColorFromExpression(runtimeColor);
          if (extracted !== null) return extracted;
        }
      }
    } catch {
      // Property doesn't exist, continue
    }

    const style = map.getStyle();
    const layer = style?.layers?.find(
      (styleLayer: LayerSpecification) => styleLayer.id === layerId
    );
    if (layer && 'paint' in layer && layer.paint) {
      const paintColor = (layer.paint as Record<string, unknown>)[propertyName];
      if (paintColor) {
        if (typeof paintColor === 'string') {
          const color = normalizeColor(paintColor);
          if (color !== null) return color;
        }
        if (Array.isArray(paintColor)) {
          const extracted = extractColorFromExpression(paintColor);
          if (extracted !== null) return extracted;
        }
      }
    }
  }

  return null;
}

/**
 * Get the primary color directly from a layer specification
 * @param layer The layer specification
 * @returns The normalized hex color, or null if not found
 */
export function getLayerColorFromSpec(layer: LayerSpecification): string | null {
  const propertyNames = COLOR_PROPERTY_MAP[layer.type];
  if (!propertyNames) return null;

  for (const propertyName of propertyNames) {
    if ('paint' in layer && layer.paint) {
      const paintColor = (layer.paint as Record<string, unknown>)[propertyName];
      if (paintColor) {
        if (typeof paintColor === 'string') {
          const color = normalizeColor(paintColor);
          if (color !== null) return color;
        }
        if (Array.isArray(paintColor)) {
          const extracted = extractColorFromExpression(paintColor);
          if (extracted !== null) return extracted;
        }
      }
    }
  }

  return null;
}

/**
 * Additional paint properties that affect a layer's preview symbol.
 */
export interface LayerSymbolStyle {
  /** line-dasharray in line-width units. */
  dasharray?: number[];
  /** Circle border colour; null disables the border. */
  strokeColor?: string | null;
  /** Registered MapLibre image for a fill-pattern; SDF images use the fill color. */
  fillPattern?: FillPatternImage;
}

/**
 * Extracts the first literal dash pattern from a paint value or expression
 * @param value Runtime or style-spec line-dasharray value
 * @returns A valid finite dash pattern, or null
 */
function extractDasharray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;

  if (
    value.length > 0 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    const dasharray = value as number[];
    if (dasharray.every((item) => item >= 0) && dasharray.some((item) => item > 0)) {
      return dasharray;
    }
    return null;
  }

  for (const item of value) {
    if (Array.isArray(item)) {
      const dasharray = extractDasharray(item);
      if (dasharray) return dasharray;
    }
  }

  return null;
}

/**
 * Resolves the preview styles supported for a layer type
 * @param layerType MapLibre layer type
 * @param getPaint Paint-property lookup for the current layer
 * @returns The resolved dash pattern or circle border style
 */
function resolveSymbolStyle(
  layerType: string,
  getPaint: (property: keyof AllPaintProperties) => unknown
): LayerSymbolStyle {
  if (layerType === 'line') {
    const dasharray = extractDasharray(getPaint('line-dasharray'));
    return dasharray ? { dasharray } : {};
  }

  if (layerType === 'circle') {
    if (getPaint('circle-stroke-width') === 0) {
      return { strokeColor: null };
    }

    const color = getPaint('circle-stroke-color');
    if (typeof color === 'string') {
      return { strokeColor: color };
    }
    if (isExpressionArray(color)) {
      const strokeColor = extractColorFromExpression(color, true);
      return strokeColor ? { strokeColor } : {};
    }
  }

  return {};
}

/**
 * Get additional symbol styles from runtime paint properties, falling back to
 * the layer definition when a runtime property is unavailable
 * @param map The MapLibre map instance
 * @param layerId The layer ID
 * @param layerType The layer type
 * @returns The resolved dash pattern, circle border style, or fill pattern
 */
export function getLayerSymbolStyle(
  map: MapLibreMap,
  layerId: string,
  layerType: string
): LayerSymbolStyle {
  if (layerType === 'fill') {
    let pattern: unknown;
    try {
      pattern = map.getPaintProperty(layerId, 'fill-pattern');
    } catch {
      // Fall back to the style definition when runtime paint is unavailable.
    }
    if (pattern === undefined) {
      const layer = map.getStyle()?.layers?.find((item) => item.id === layerId);
      if (layer && 'paint' in layer && layer.paint) {
        pattern = (layer.paint as Record<string, unknown>)['fill-pattern'];
      }
    }
    const fillPattern = resolvePatternImage(map, pattern);
    return fillPattern ? { fillPattern } : {};
  }

  const getPaint = (property: keyof AllPaintProperties): unknown => {
    let value: unknown;
    try {
      value = map.getPaintProperty(layerId, property);
    } catch {
      // Fall back to the style definition when the runtime property is absent.
    }
    if (value !== undefined && value !== null) return value;

    const layer = map.getStyle()?.layers?.find((item) => item.id === layerId);
    if (layer && 'paint' in layer && layer.paint) {
      return (layer.paint as Record<string, unknown>)[property];
    }
    return undefined;
  };

  return resolveSymbolStyle(layerType, getPaint);
}

/**
 * Get additional symbol styles directly from a layer specification
 * @param layer The layer specification
 * @returns The resolved dash pattern or circle border style
 */
export function getLayerSymbolStyleFromSpec(
  layer: LayerSpecification
): LayerSymbolStyle {
  const getPaint = (property: keyof AllPaintProperties): unknown => {
    if ('paint' in layer && layer.paint) {
      return (layer.paint as Record<string, unknown>)[property];
    }
    return undefined;
  };

  return resolveSymbolStyle(layer.type, getPaint);
}

/**
 * Resolve a representative registered image from a fill-pattern expression.
 * Only visit output values, never match labels or condition operands.
 */
function resolvePatternImage(
  map: MapLibreMap,
  value: unknown
): FillPatternImage | undefined {
  if (typeof value === 'string') return map.getImage(value);
  if (!Array.isArray(value)) return undefined;

  const [operator] = value;
  let start: number;
  let stride: number;
  switch (operator) {
    case 'literal':
    case 'image':
      return typeof value[1] === 'string' ? map.getImage(value[1]) : undefined;
    case 'coalesce':
      start = 1;
      stride = 1;
      break;
    case 'match':
      start = 3;
      stride = 2;
      break;
    case 'case':
    case 'step':
      start = 2;
      stride = 2;
      break;
    case 'interpolate':
    case 'interpolate-hcl':
    case 'interpolate-lab':
      start = 4;
      stride = 2;
      break;
    default:
      return undefined;
  }
  for (let i = start; i < value.length; i += stride) {
    const image = resolvePatternImage(map, value[i]);
    if (image) return image;
  }
  // match/case have a final fallback outside the output/stop pairs.
  if (operator === 'match' || operator === 'case') {
    return resolvePatternImage(map, value[value.length - 1]);
  }
  return undefined;
}

/** Registered pattern pixels and metadata, compatible with map.getImage(). */
export interface FillPatternImage {
  data: {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
  };
  pixelRatio: number;
  sdf: boolean;
  /** Incremented by MapLibre when image pixels change. */
  version?: number;
}
const patternTiles = new WeakMap<
  FillPatternImage,
  { version: number | undefined; urls: Map<string, string> }
>();

/** Convert RGBA pixels or an SDF alpha channel into a browser-renderable tile. */
function createPatternTile(image: FillPatternImage, color: string): string | null {
  const key = image.sdf ? color : '';
  let cached = patternTiles.get(image);
  if (cached?.version !== image.version) cached = undefined;
  const existing = cached?.urls.get(key);
  if (existing) return existing;
  if (typeof document === 'undefined') return null;

  const { width, height, data } = image.data;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(width, height);
  if (image.sdf) {
    const normalizedColor = normalizeColor(color);
    if (normalizedColor === null) return null;
    const r = parseInt(normalizedColor.slice(1, 3), 16);
    const g = parseInt(normalizedColor.slice(3, 5), 16);
    const b = parseInt(normalizedColor.slice(5, 7), 16);
    // MapLibre's SDF contour is 0.75; smoothstep preserves antialiased edges.
    const gamma = 0.105 / image.pixelRatio;
    for (let i = 0; i < data.length; i += 4) {
      const t = Math.max(
        0,
        Math.min(1, (data[i + 3] / 255 - 0.75 + gamma) / (2 * gamma))
      );
      pixels.data[i] = r;
      pixels.data[i + 1] = g;
      pixels.data[i + 2] = b;
      pixels.data[i + 3] = Math.round(255 * t * t * (3 - 2 * t));
    }
  } else {
    pixels.data.set(data);
  }
  context.putImageData(pixels, 0, 0);
  const url = canvas.toDataURL();
  if (!cached) {
    cached = { version: image.version, urls: new Map() };
    patternTiles.set(image, cached);
  }
  cached.urls.set(key, url);
  return url;
}

/**
 * Darken a hex color by a given amount
 * @param hexColor The hex color to darken (e.g., '#ff0000')
 * @param amount Amount to darken (0-1, where 1 is fully black)
 * @returns The darkened hex color
 */
export function darkenColor(hexColor: string, amount: number): string {
  // Normalize to 6-digit hex
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = Math.max(
    0,
    parseInt(hex.slice(0, 2), 16) - Math.round(255 * amount)
  );
  const g = Math.max(
    0,
    parseInt(hex.slice(2, 4), 16) - Math.round(255 * amount)
  );
  const b = Math.max(
    0,
    parseInt(hex.slice(4, 6), 16) - Math.round(255 * amount)
  );
  return rgbToHex(r, g, b);
}

// SVG Symbol Templates

/**
 * Create a fill symbol (filled rectangle)
 */
function createFillSymbol(
  size: number,
  color: string,
  image?: FillPatternImage
): string {
  const padding = 2;
  const borderColor = darkenColor(color, 0.3);
  if (image) {
    const url = createPatternTile(image, color);
    if (url) {
      const id = `fillPattern_${Math.random().toString(36).slice(2, 9)}`;
      const width = image.data.width / image.pixelRatio;
      const height = image.data.height / image.pixelRatio;
      // Keep small patterns at their natural scale; fit two large tiles in
      // the swatch so the repeating motif remains recognizable.
      const scale = Math.min(1, (size - padding * 2) / (2 * Math.max(width, height)));
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="${id}" patternUnits="userSpaceOnUse" x="${padding}" y="${padding}" width="${width * scale}" height="${height * scale}">
            <image href="${url}" width="${width * scale}" height="${height * scale}"/>
          </pattern>
        </defs>
        <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
              fill="url(#${id})" stroke="${borderColor}" stroke-width="1" rx="1"/>
      </svg>`;
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="${color}" stroke="${borderColor}" stroke-width="1" rx="1"/>
  </svg>`;
}

/**
 * Create a line symbol (horizontal line)
 * @param size Symbol size in pixels
 * @param color Line color
 * @param strokeWidth Preview stroke width in pixels
 * @param dasharray Optional line-dasharray scaled to fit the symbol
 * @returns SVG markup string
 */
function createLineSymbol(
  size: number,
  color: string,
  strokeWidth: number = 2,
  dasharray?: number[]
): string {
  const y = size / 2;
  const padding = 2;
  let dashAttributes = 'stroke-linecap="round"';
  if (dasharray && dasharray.length > 0) {
    const lineLength = size - padding * 2;
    const dashLength = dasharray[0];
    const gapLength = dasharray.length > 1 ? dasharray[1] : dashLength;
    const fitLength = dashLength + gapLength + dashLength;
    const scale =
      fitLength > 0
        ? Math.min(strokeWidth, lineLength / fitLength)
        : strokeWidth;
    const scaledDasharray = dasharray
      .map((value) => Number((value * scale).toFixed(2)))
      .join(' ');
    dashAttributes = `stroke-linecap="butt" stroke-dasharray="${scaledDasharray}"`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padding}" y1="${y}" x2="${size - padding}" y2="${y}"
          stroke="${color}" stroke-width="${strokeWidth}" ${dashAttributes}/>
  </svg>`;
}

/**
 * Create a circle symbol (filled circle)
 * @param size Symbol size in pixels
 * @param color Circle fill color
 * @param strokeColor Border color; null disables the border, undefined uses a darkened fill
 * @returns SVG markup string
 */
function createCircleSymbol(
  size: number,
  color: string,
  strokeColor?: string | null
): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 3;
  const borderAttributes =
    strokeColor === undefined
      ? `stroke="${darkenColor(color, 0.3)}" stroke-width="1"`
      : strokeColor === null
        ? 'stroke="none"'
        : `stroke="${strokeColor}" stroke-width="1"`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"
            ${borderAttributes}/>
  </svg>`;
}

/**
 * Create a marker/pin symbol for symbol layers
 */
function createMarkerSymbol(size: number, color: string): string {
  const borderColor = darkenColor(color, 0.3);
  // Simple pin/marker shape
  const cx = size / 2;
  const pinWidth = size * 0.5;
  const pinHeight = size * 0.7;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <path d="M${cx} ${size - 2}
             L${cx - pinWidth / 2} ${size - pinHeight}
             A${pinWidth / 2} ${pinWidth / 2} 0 1 1 ${cx + pinWidth / 2} ${size - pinHeight}
             Z"
          fill="${color}" stroke="${borderColor}" stroke-width="1"/>
    <circle cx="${cx}" cy="${size - pinHeight - pinWidth / 4}" r="${pinWidth / 5}" fill="white"/>
  </svg>`;
}

/**
 * Create a raster symbol (gradient pattern)
 */
function createRasterSymbol(size: number): string {
  const padding = 2;
  const id = `rasterGrad_${Math.random().toString(36).slice(2, 9)}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e0e0e0"/>
        <stop offset="50%" stop-color="#808080"/>
        <stop offset="100%" stop-color="#404040"/>
      </linearGradient>
    </defs>
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="url(#${id})" rx="1"/>
  </svg>`;
}

/**
 * Create a background symbol (rectangle with inner indicator)
 */
function createBackgroundSymbol(size: number, color: string): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="${color}" rx="2"/>
    <rect x="3" y="3" width="${size - 6}" height="${size - 6}" fill="none"
          stroke="white" stroke-width="1" stroke-opacity="0.5" rx="1"/>
  </svg>`;
}

/**
 * Create a heatmap symbol (orange-red gradient)
 */
function createHeatmapSymbol(size: number): string {
  const padding = 2;
  const id = `heatmapGrad_${Math.random().toString(36).slice(2, 9)}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="${id}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffff00"/>
        <stop offset="50%" stop-color="#ff8800"/>
        <stop offset="100%" stop-color="#ff0000"/>
      </radialGradient>
    </defs>
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="url(#${id})" rx="1"/>
  </svg>`;
}

/**
 * Create a hillshade symbol (gray gradient)
 */
function createHillshadeSymbol(size: number): string {
  const padding = 2;
  const id = `hillshadeGrad_${Math.random().toString(36).slice(2, 9)}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#666666"/>
      </linearGradient>
    </defs>
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="url(#${id})" rx="1"/>
  </svg>`;
}

/**
 * Create a fill-extrusion symbol (3D-ish rectangle)
 */
function createFillExtrusionSymbol(size: number, color: string): string {
  const borderColor = darkenColor(color, 0.3);
  const topColor = color;
  const sideColor = darkenColor(color, 0.2);
  const depth = 3;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${2 + depth},2 ${size - 2},2 ${size - 2},${size - 2 - depth} ${size - 2 - depth},${size - 2} 2,${size - 2} 2,${2 + depth}"
             fill="${topColor}" stroke="${borderColor}" stroke-width="1"/>
    <polygon points="2,${2 + depth} ${2 + depth},2 ${2 + depth},${size - 2 - depth} 2,${size - 2}"
             fill="${sideColor}" stroke="${borderColor}" stroke-width="0.5"/>
    <polygon points="${2 + depth},${size - 2 - depth} ${size - 2},${size - 2 - depth} ${size - 2 - depth},${size - 2} 2,${size - 2}"
             fill="${sideColor}" stroke="${borderColor}" stroke-width="0.5"/>
  </svg>`;
}

/**
 * Create a default symbol (simple square)
 */
function createDefaultSymbol(size: number, color: string): string {
  const padding = 2;
  const borderColor = darkenColor(color, 0.3);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="${color}" stroke="${borderColor}" stroke-width="1"/>
  </svg>`;
}

/**
 * Create a COG (Cloud Optimized GeoTIFF) symbol
 * Grid pattern representing raster tiles
 */
function createCOGSymbol(size: number, color: string): string {
  const padding = 2;
  const borderColor = darkenColor(color, 0.3);
  const cellSize = (size - padding * 2) / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padding}" y="${padding}" width="${cellSize}" height="${cellSize}" fill="${color}" stroke="${borderColor}" stroke-width="0.5"/>
    <rect x="${padding + cellSize}" y="${padding}" width="${cellSize}" height="${cellSize}" fill="${color}" stroke="${borderColor}" stroke-width="0.5" opacity="0.8"/>
    <rect x="${padding}" y="${padding + cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}" stroke="${borderColor}" stroke-width="0.5" opacity="0.6"/>
    <rect x="${padding + cellSize}" y="${padding + cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}" stroke="${borderColor}" stroke-width="0.5" opacity="0.4"/>
  </svg>`;
}

/**
 * Create a Zarr symbol
 * Layered grid pattern representing multidimensional data
 */
function createZarrSymbol(size: number, color: string): string {
  const padding = 2;
  const borderColor = darkenColor(color, 0.3);
  const innerSize = size - padding * 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padding + 2}" y="${padding}" width="${innerSize - 2}" height="${innerSize - 2}" fill="${darkenColor(color, 0.2)}" stroke="${borderColor}" stroke-width="0.5" rx="1"/>
    <rect x="${padding + 1}" y="${padding + 1}" width="${innerSize - 2}" height="${innerSize - 2}" fill="${darkenColor(color, 0.1)}" stroke="${borderColor}" stroke-width="0.5" rx="1"/>
    <rect x="${padding}" y="${padding + 2}" width="${innerSize - 2}" height="${innerSize - 2}" fill="${color}" stroke="${borderColor}" stroke-width="0.5" rx="1"/>
    <line x1="${padding + 3}" y1="${padding + 5}" x2="${padding + innerSize - 5}" y2="${padding + 5}" stroke="${borderColor}" stroke-width="0.5" opacity="0.5"/>
    <line x1="${padding + 3}" y1="${padding + 8}" x2="${padding + innerSize - 5}" y2="${padding + 8}" stroke="${borderColor}" stroke-width="0.5" opacity="0.5"/>
  </svg>`;
}

/**
 * Create a generic custom raster symbol
 * Gradient grid representing custom raster layers
 */
function createCustomRasterSymbol(size: number, color: string): string {
  const padding = 2;
  const borderColor = darkenColor(color, 0.3);
  const id = `customRasterGrad_${Math.random().toString(36).slice(2, 9)}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${darkenColor(color, 0.4)}"/>
      </linearGradient>
    </defs>
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="url(#${id})" stroke="${borderColor}" stroke-width="1" rx="1"/>
    <line x1="${size / 2}" y1="${padding}" x2="${size / 2}" y2="${size - padding}" stroke="${borderColor}" stroke-width="0.5" opacity="0.3"/>
    <line x1="${padding}" y1="${size / 2}" x2="${size - padding}" y2="${size / 2}" stroke="${borderColor}" stroke-width="0.5" opacity="0.3"/>
  </svg>`;
}

/**
 * Create a stacked layers symbol for background layer groups
 * Shows multiple overlapping rectangles to represent multiple layers
 */
function createStackedLayersSymbol(size: number): string {
  const colors = ['#a8d4a8', '#8ec4e8', '#d4c4a8'];
  const borderColor = '#666666';
  // Three stacked rectangles offset diagonally
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="1" width="${size - 6}" height="${size - 6}" fill="${colors[2]}" stroke="${borderColor}" stroke-width="0.75" rx="1"/>
    <rect x="2" y="3" width="${size - 6}" height="${size - 6}" fill="${colors[1]}" stroke="${borderColor}" stroke-width="0.75" rx="1"/>
    <rect x="0" y="5" width="${size - 6}" height="${size - 6}" fill="${colors[0]}" stroke="${borderColor}" stroke-width="0.75" rx="1"/>
  </svg>`;
}

/**
 * Symbol generation options
 */
export interface SymbolOptions {
  /** Symbol size in pixels (default: 16) */
  size?: number;
  /** Stroke width for line symbols (default: 2) */
  strokeWidth?: number;
  /** line-dasharray in line-width units; rendered to fit the line swatch. */
  dasharray?: number[];
  /** Circle border colour; null disables the border. */
  strokeColor?: string | null;
  /** Registered MapLibre image for a fill-pattern; SDF images use the fill color. */
  fillPattern?: FillPatternImage;
}

/**
 * Create an SVG symbol for a layer type
 * @param layerType The MapLibre layer type
 * @param color The primary color (hex format), or null for default
 * @param options Optional configuration
 * @returns SVG markup string
 */
export function createLayerSymbolSVG(
  layerType: string,
  color: string | null,
  options: SymbolOptions = {}
): string {
  const size = options.size || 16;
  const strokeWidth = options.strokeWidth || 2;
  const fillColor = color || (options.fillPattern?.sdf ? '#000000' : '#888888');

  switch (layerType) {
    case 'fill':
      return createFillSymbol(size, fillColor, options.fillPattern);
    case 'line':
      return createLineSymbol(size, fillColor, strokeWidth, options.dasharray);
    case 'circle':
      return createCircleSymbol(size, fillColor, options.strokeColor);
    case 'symbol':
      return createMarkerSymbol(size, fillColor);
    case 'raster':
      return createRasterSymbol(size);
    case 'background':
      return createBackgroundSymbol(size, fillColor);
    case 'heatmap':
      return createHeatmapSymbol(size);
    case 'hillshade':
      return createHillshadeSymbol(size);
    case 'fill-extrusion':
      return createFillExtrusionSymbol(size, fillColor);
    case 'background-group':
      return createStackedLayersSymbol(size);
    case 'cog':
      return createCOGSymbol(size, fillColor);
    case 'zarr':
      return createZarrSymbol(size, fillColor);
    case 'custom-raster':
      return createCustomRasterSymbol(size, fillColor);
    default:
      return createDefaultSymbol(size, fillColor);
  }
}

/**
 * Create an SVG symbol for the Background layer group
 * @param size Symbol size in pixels (default: 16)
 * @returns SVG markup string
 */
export function createBackgroundGroupSymbolSVG(size: number = 16): string {
  return createStackedLayersSymbol(size);
}
