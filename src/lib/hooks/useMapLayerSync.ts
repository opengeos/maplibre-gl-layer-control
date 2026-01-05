import { useEffect, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LayerState } from '../core/types';
import { getLayerOpacity } from '../utils/layerUtils';

export interface UseMapLayerSyncOptions {
  /** MapLibre map instance */
  map: MapLibreMap;
  /** Callback when layer states change on the map */
  onLayerStatesChange?: (layerStates: Record<string, LayerState>) => void;
  /** Callback when new layers are detected */
  onNewLayers?: (layerIds: string[]) => void;
  /** Layers to track (empty = track all) */
  trackedLayers?: string[];
}

/**
 * Hook to sync React state with MapLibre map layer changes
 *
 * @example
 * ```tsx
 * useMapLayerSync({
 *   map,
 *   onLayerStatesChange: (states) => {
 *     console.log('Layer states updated:', states);
 *   },
 *   onNewLayers: (layerIds) => {
 *     console.log('New layers detected:', layerIds);
 *   }
 * });
 * ```
 */
export function useMapLayerSync({
  map,
  onLayerStatesChange,
  onNewLayers,
  trackedLayers = [],
}: UseMapLayerSyncOptions): void {
  const updateLayerStates = useCallback(() => {
    if (!onLayerStatesChange) return;

    const style = map.getStyle();
    if (!style || !style.layers) return;

    const layerStates: Record<string, LayerState> = {};

    style.layers.forEach((layer) => {
      // Filter by tracked layers if specified
      if (trackedLayers.length > 0 && !trackedLayers.includes(layer.id)) {
        return;
      }

      try {
        const layerType = layer.type;
        const visibility = map.getLayoutProperty(layer.id, 'visibility');
        const opacity = getLayerOpacity(map, layer.id, layerType);

        layerStates[layer.id] = {
          visible: visibility !== 'none',
          opacity,
          name: layer.id.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        };
      } catch (error) {
        console.warn(`Failed to sync state for layer ${layer.id}:`, error);
      }
    });

    onLayerStatesChange(layerStates);
  }, [map, onLayerStatesChange, trackedLayers]);

  const checkForNewLayers = useCallback(() => {
    if (!onNewLayers) return;

    const style = map.getStyle();
    if (!style || !style.layers) return;

    const currentLayerIds = style.layers
      .map((layer) => layer.id)
      .filter((id) => {
        if (trackedLayers.length > 0) {
          return trackedLayers.includes(id);
        }
        return true;
      });

    onNewLayers(currentLayerIds);
  }, [map, onNewLayers, trackedLayers]);

  useEffect(() => {
    if (!map) return;

    // Set up event listeners for map changes
    const handleStyleData = () => {
      setTimeout(() => {
        updateLayerStates();
        checkForNewLayers();
      }, 100);
    };

    const handleData = (e: any) => {
      if (e.sourceDataType === 'content') {
        setTimeout(() => {
          updateLayerStates();
          checkForNewLayers();
        }, 100);
      }
    };

    const handleSourceData = (e: any) => {
      if (e.sourceDataType === 'metadata') {
        setTimeout(() => {
          checkForNewLayers();
        }, 150);
      }
    };

    map.on('styledata', handleStyleData);
    map.on('data', handleData);
    map.on('sourcedata', handleSourceData);

    // Initial sync
    updateLayerStates();
    checkForNewLayers();

    // Cleanup
    return () => {
      map.off('styledata', handleStyleData);
      map.off('data', handleData);
      map.off('sourcedata', handleSourceData);
    };
  }, [map, updateLayerStates, checkForNewLayers]);
}
