import { useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LayerState } from '../core/types';
import { getLayerType, setLayerOpacity } from '../utils/layerUtils';

export interface UseLayerStateOptions {
  /** MapLibre map instance */
  map: MapLibreMap;
  /** Initial layer states */
  initialStates: Record<string, LayerState>;
}

export interface UseLayerStateReturn {
  /** Current layer states */
  layerStates: Record<string, LayerState>;
  /** Toggle layer visibility */
  toggleVisibility: (layerId: string) => void;
  /** Set layer opacity */
  setOpacity: (layerId: string, opacity: number) => void;
  /** Update a layer state */
  updateLayerState: (layerId: string, updates: Partial<LayerState>) => void;
}

/**
 * Hook for managing layer visibility and opacity state
 *
 * @example
 * ```tsx
 * const { layerStates, toggleVisibility, setOpacity } = useLayerState({
 *   map,
 *   initialStates: {
 *     'my-layer': { visible: true, opacity: 1, name: 'My Layer' }
 *   }
 * });
 * ```
 */
export function useLayerState({
  map,
  initialStates,
}: UseLayerStateOptions): UseLayerStateReturn {
  const [layerStates, setLayerStates] = useState<Record<string, LayerState>>(initialStates);

  const toggleVisibility = useCallback(
    (layerId: string) => {
      setLayerStates((prev) => {
        const newVisible = !prev[layerId]?.visible;
        const newStates = {
          ...prev,
          [layerId]: {
            ...prev[layerId],
            visible: newVisible,
          },
        };

        // Update map
        map.setLayoutProperty(layerId, 'visibility', newVisible ? 'visible' : 'none');

        return newStates;
      });
    },
    [map]
  );

  const setOpacity = useCallback(
    (layerId: string, opacity: number) => {
      setLayerStates((prev) => {
        const newStates = {
          ...prev,
          [layerId]: {
            ...prev[layerId],
            opacity,
          },
        };

        // Update map
        const layerType = getLayerType(map, layerId);
        if (layerType) {
          setLayerOpacity(map, layerId, layerType, opacity);
        }

        return newStates;
      });
    },
    [map]
  );

  const updateLayerState = useCallback(
    (layerId: string, updates: Partial<LayerState>) => {
      setLayerStates((prev) => ({
        ...prev,
        [layerId]: {
          ...prev[layerId],
          ...updates,
        },
      }));

      // Apply updates to map
      if (updates.visible !== undefined) {
        map.setLayoutProperty(layerId, 'visibility', updates.visible ? 'visible' : 'none');
      }
      if (updates.opacity !== undefined) {
        const layerType = getLayerType(map, layerId);
        if (layerType) {
          setLayerOpacity(map, layerId, layerType, updates.opacity);
        }
      }
    },
    [map]
  );

  return {
    layerStates,
    toggleVisibility,
    setOpacity,
    updateLayerState,
  };
}
