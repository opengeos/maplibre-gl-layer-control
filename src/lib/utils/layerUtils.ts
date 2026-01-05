import type { Map as MapLibreMap } from 'maplibre-gl';
import type { StyleableLayerType } from '../core/types';

/**
 * Get the opacity property name for a given layer type
 * @param layerType MapLibre layer type
 * @returns Opacity property name(s)
 */
export function getOpacityProperty(layerType: string): string | string[] {
  switch (layerType) {
    case 'fill':
      return 'fill-opacity';
    case 'line':
      return 'line-opacity';
    case 'circle':
      return 'circle-opacity';
    case 'symbol':
      // Symbol layers have both icon and text opacity
      return ['icon-opacity', 'text-opacity'];
    case 'raster':
      return 'raster-opacity';
    case 'background':
      return 'background-opacity';
    default:
      return `${layerType}-opacity`;
  }
}

/**
 * Get the current opacity value for a layer
 * @param map MapLibre map instance
 * @param layerId Layer ID
 * @param layerType Layer type
 * @returns Current opacity value (0-1)
 */
export function getLayerOpacity(
  map: MapLibreMap,
  layerId: string,
  layerType: string
): number {
  const opacityProp = getOpacityProperty(layerType);

  if (Array.isArray(opacityProp)) {
    // For symbol layers, use icon-opacity as the primary value
    const opacity = map.getPaintProperty(layerId, opacityProp[0]);
    return (opacity !== undefined && opacity !== null) ? opacity as number : 1.0;
  }

  const opacity = map.getPaintProperty(layerId, opacityProp);
  return (opacity !== undefined && opacity !== null) ? opacity as number : 1.0;
}

/**
 * Set the opacity for a layer
 * @param map MapLibre map instance
 * @param layerId Layer ID
 * @param layerType Layer type
 * @param opacity Opacity value (0-1)
 */
export function setLayerOpacity(
  map: MapLibreMap,
  layerId: string,
  layerType: string,
  opacity: number
): void {
  const opacityProp = getOpacityProperty(layerType);

  if (Array.isArray(opacityProp)) {
    // For symbol layers, set both icon and text opacity
    opacityProp.forEach((prop) => {
      map.setPaintProperty(layerId, prop, opacity);
    });
  } else {
    map.setPaintProperty(layerId, opacityProp, opacity);
  }
}

/**
 * Check if a layer type supports style editing
 * @param layerType Layer type
 * @returns True if the layer type supports style editing
 */
export function isStyleableLayerType(layerType: string): layerType is StyleableLayerType {
  return ['fill', 'line', 'circle', 'symbol', 'raster'].includes(layerType);
}

/**
 * Get layer type from map
 * @param map MapLibre map instance
 * @param layerId Layer ID
 * @returns Layer type or null if layer not found
 */
export function getLayerType(map: MapLibreMap, layerId: string): string | null {
  try {
    const layer = map.getLayer(layerId);
    return layer ? layer.type : null;
  } catch (error) {
    console.warn(`Failed to get layer type for ${layerId}:`, error);
    return null;
  }
}
