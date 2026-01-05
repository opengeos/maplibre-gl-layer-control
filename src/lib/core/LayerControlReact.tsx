import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { LayerControl } from './LayerControl';
import type { LayerControlOptions } from './types';

export interface LayerControlReactProps extends LayerControlOptions {
  /** MapLibre map instance */
  map: MapLibreMap;
  /** Position on the map */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * React wrapper for LayerControl
 *
 * @example
 * ```tsx
 * import { LayerControlReact } from 'maplibre-gl-layer-control/react';
 *
 * function MapComponent() {
 *   const [map, setMap] = useState<MapLibreMap | null>(null);
 *
 *   return (
 *     <>
 *       <div ref={(el) => {
 *         if (el && !map) {
 *           const newMap = new maplibregl.Map({ container: el, ... });
 *           setMap(newMap);
 *         }
 *       }} />
 *       {map && (
 *         <LayerControlReact
 *           map={map}
 *           position="top-right"
 *           layerStates={{
 *             'my-layer': { visible: true, opacity: 1, name: 'My Layer' }
 *           }}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function LayerControlReact({
  map,
  position = 'top-right',
  ...options
}: LayerControlReactProps) {
  const controlRef = useRef<LayerControl | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create and add control
    const control = new LayerControl(options);
    controlRef.current = control;
    map.addControl(control, position);

    // Cleanup on unmount
    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
  }, [map, position]); // Only recreate if map or position changes

  // Update control options if they change
  useEffect(() => {
    // Note: LayerControl doesn't currently support updating options after creation
    // This is a placeholder for future enhancement
    // For now, changing options will require remounting the component
  }, [options]);

  return null; // This component doesn't render anything
}
