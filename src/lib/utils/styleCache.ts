import type { Map as MapLibreMap } from 'maplibre-gl';
import type { OriginalStyle } from '../core/types';

/**
 * Deep clone a paint value (handles complex MapLibre expressions)
 * @param value Paint value to clone
 * @returns Cloned value
 */
export function clonePaintValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => clonePaintValue(item));
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }
  return value;
}

/**
 * Cache the original paint properties for a layer
 * @param map MapLibre map instance
 * @param layerId Layer ID
 * @param originalStyles Map to store original styles
 */
export function cacheOriginalLayerStyle(
  map: MapLibreMap,
  layerId: string,
  originalStyles: Map<string, OriginalStyle>
): void {
  if (originalStyles.has(layerId)) {
    return; // Already cached
  }

  try {
    const layer = map.getLayer(layerId);
    if (!layer) {
      return;
    }

    const paint: Record<string, any> = {};
    const style = map.getStyle();
    const layerDef = style.layers?.find(l => l.id === layerId);

    // For raster layers, handle all properties with defaults
    if (layer.type === 'raster') {
      // Default values from MapLibre GL spec
      const rasterDefaults: Record<string, number> = {
        'raster-opacity': 1,
        'raster-brightness-min': 0,
        'raster-brightness-max': 1,
        'raster-saturation': 0,
        'raster-contrast': 0,
        'raster-hue-rotate': 0
      };

      // Start with defaults
      Object.assign(paint, rasterDefaults);

      // Override with values from layer definition
      if (layerDef && 'paint' in layerDef && layerDef.paint) {
        Object.entries(layerDef.paint).forEach(([prop, value]) => {
          if (prop.startsWith('raster-')) {
            paint[prop] = clonePaintValue(value);
          }
        });
      }
    } else {
      // For non-raster layers, just get values from the layer definition
      if (layerDef && 'paint' in layerDef && layerDef.paint) {
        Object.entries(layerDef.paint).forEach(([prop, value]) => {
          paint[prop] = clonePaintValue(value);
        });
      }
    }

    originalStyles.set(layerId, { paint });
  } catch (error) {
    console.warn(`Failed to cache original style for ${layerId}:`, error);
  }
}

/**
 * Get the current value of a paint property
 * @param map MapLibre map instance
 * @param layerId Layer ID
 * @param property Property name
 * @param fallback Fallback value if property is not set
 * @returns Current property value
 */
export function getCurrentPaintValue(
  map: MapLibreMap,
  layerId: string,
  property: string,
  fallback?: any
): any {
  try {
    const value = map.getPaintProperty(layerId, property);
    return value !== undefined ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

/**
 * Restore original paint properties for a layer
 * @param map MapLibre map instance
 * @param layerId Layer ID
 * @param originalStyles Map of original styles
 * @returns Object with restored properties
 */
export function restoreOriginalStyle(
  map: MapLibreMap,
  layerId: string,
  originalStyles: Map<string, OriginalStyle>
): Record<string, any> {
  const original = originalStyles.get(layerId);
  if (!original) {
    return {};
  }

  const applied: Record<string, any> = {};

  Object.entries(original.paint).forEach(([property, value]) => {
    try {
      const restoredValue = clonePaintValue(value);
      map.setPaintProperty(layerId, property, restoredValue);
      applied[property] = restoredValue;
    } catch (error) {
      console.warn(`Failed to restore ${property} for ${layerId}:`, error);
    }
  });

  return applied;
}
