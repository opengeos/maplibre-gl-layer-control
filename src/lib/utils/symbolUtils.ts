import type { Map as MapLibreMap, LayerSpecification } from 'maplibre-gl';
import { normalizeColor, rgbToHex } from './colorUtils';

/**
 * Map of layer types to their primary color property
 */
const COLOR_PROPERTY_MAP: Record<string, string[]> = {
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
  circle: ['circle-color', 'circle-stroke-color'],
  symbol: ['icon-color', 'text-color'],
  background: ['background-color'],
  heatmap: ['heatmap-color'],
  'fill-extrusion': ['fill-extrusion-color'],
};

/**
 * Extract the first color value from a MapLibre expression
 * Handles expressions like ['case', ...], ['match', ...], ['interpolate', ...]
 * @param expression The MapLibre expression to extract color from
 * @returns The first color found, or null
 */
function extractColorFromExpression(expression: any[]): string | null {
  if (!Array.isArray(expression) || expression.length === 0) return null;

  // Recursively search for color values
  for (const item of expression) {
    if (typeof item === 'string') {
      // Check if it's a color string
      if (
        item.startsWith('#') ||
        item.startsWith('rgb') ||
        item.startsWith('hsl')
      ) {
        return normalizeColor(item);
      }
    } else if (Array.isArray(item)) {
      const result = extractColorFromExpression(item);
      if (result) return result;
    }
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

  // Try each property in order
  for (const propertyName of propertyNames) {
    // First try runtime property (may have been changed)
    try {
      const runtimeColor = map.getPaintProperty(layerId, propertyName);
      if (runtimeColor) {
        if (typeof runtimeColor === 'string') {
          return normalizeColor(runtimeColor);
        }
        if (Array.isArray(runtimeColor)) {
          // Handle expressions
          const extracted = extractColorFromExpression(runtimeColor);
          if (extracted) return extracted;
        }
      }
    } catch {
      // Property doesn't exist, continue
    }

    // Try from layer definition
    const style = map.getStyle();
    const layer = style?.layers?.find(
      (l: LayerSpecification) => l.id === layerId
    );
    if (layer && 'paint' in layer && layer.paint) {
      const paintColor = (layer.paint as Record<string, any>)[propertyName];
      if (paintColor) {
        if (typeof paintColor === 'string') {
          return normalizeColor(paintColor);
        }
        if (Array.isArray(paintColor)) {
          const extracted = extractColorFromExpression(paintColor);
          if (extracted) return extracted;
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
      const paintColor = (layer.paint as Record<string, any>)[propertyName];
      if (paintColor) {
        if (typeof paintColor === 'string') {
          return normalizeColor(paintColor);
        }
        if (Array.isArray(paintColor)) {
          const extracted = extractColorFromExpression(paintColor);
          if (extracted) return extracted;
        }
      }
    }
  }

  return null;
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
function createFillSymbol(size: number, color: string): string {
  const padding = 2;
  const borderColor = darkenColor(color, 0.3);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}"
          fill="${color}" stroke="${borderColor}" stroke-width="1" rx="1"/>
  </svg>`;
}

/**
 * Create a line symbol (horizontal line)
 */
function createLineSymbol(
  size: number,
  color: string,
  strokeWidth: number = 2
): string {
  const y = size / 2;
  const padding = 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padding}" y1="${y}" x2="${size - padding}" y2="${y}"
          stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Create a circle symbol (filled circle)
 */
function createCircleSymbol(size: number, color: string): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 3;
  const borderColor = darkenColor(color, 0.3);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"
            stroke="${borderColor}" stroke-width="1"/>
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
  const fillColor = color || '#888888'; // Fallback gray

  switch (layerType) {
    case 'fill':
      return createFillSymbol(size, fillColor);
    case 'line':
      return createLineSymbol(size, fillColor, strokeWidth);
    case 'circle':
      return createCircleSymbol(size, fillColor);
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
