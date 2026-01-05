import { useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { OriginalStyle } from '../core/types';
import { cacheOriginalLayerStyle, restoreOriginalStyle } from '../utils/styleCache';

export interface UseStyleEditorOptions {
  /** MapLibre map instance */
  map: MapLibreMap;
}

export interface UseStyleEditorReturn {
  /** Currently active editor (layer ID) */
  activeEditor: string | null;
  /** Original styles cache */
  originalStyles: Map<string, OriginalStyle>;
  /** Open style editor for a layer */
  openEditor: (layerId: string) => void;
  /** Close the active editor */
  closeEditor: () => void;
  /** Toggle editor for a layer */
  toggleEditor: (layerId: string) => void;
  /** Reset layer to original style */
  resetStyle: (layerId: string) => void;
  /** Apply style changes */
  applyStyle: (layerId: string, property: string, value: any) => void;
}

/**
 * Hook for managing style editor state
 *
 * @example
 * ```tsx
 * const { activeEditor, openEditor, closeEditor, resetStyle } = useStyleEditor({ map });
 *
 * return (
 *   <button onClick={() => openEditor('my-layer')}>
 *     Edit Style
 *   </button>
 * );
 * ```
 */
export function useStyleEditor({ map }: UseStyleEditorOptions): UseStyleEditorReturn {
  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  const [originalStyles, setOriginalStyles] = useState<Map<string, OriginalStyle>>(
    new Map()
  );

  const openEditor = useCallback(
    (layerId: string) => {
      // Cache original style if not already cached
      if (!originalStyles.has(layerId)) {
        const newOriginalStyles = new Map(originalStyles);
        cacheOriginalLayerStyle(map, layerId, newOriginalStyles);
        setOriginalStyles(newOriginalStyles);
      }

      setActiveEditor(layerId);
    },
    [map, originalStyles]
  );

  const closeEditor = useCallback(() => {
    setActiveEditor(null);
  }, []);

  const toggleEditor = useCallback(
    (layerId: string) => {
      if (activeEditor === layerId) {
        closeEditor();
      } else {
        openEditor(layerId);
      }
    },
    [activeEditor, openEditor, closeEditor]
  );

  const resetStyle = useCallback(
    (layerId: string) => {
      restoreOriginalStyle(map, layerId, originalStyles);
    },
    [map, originalStyles]
  );

  const applyStyle = useCallback(
    (layerId: string, property: string, value: any) => {
      try {
        map.setPaintProperty(layerId, property, value);
      } catch (error) {
        console.warn(`Failed to apply style ${property} to ${layerId}:`, error);
      }
    },
    [map]
  );

  return {
    activeEditor,
    originalStyles,
    openEditor,
    closeEditor,
    toggleEditor,
    resetStyle,
    applyStyle,
  };
}
