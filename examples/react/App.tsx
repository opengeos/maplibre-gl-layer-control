import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { LayerControlReact } from '../../src/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../src/lib/styles/layer-control.css';

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Create map
    const newMap = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-74.5, 40],
      zoom: 9,
    });

    // Add navigation controls to top-right
    newMap.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add fullscreen control to top-right (after navigation)
    newMap.addControl(new maplibregl.FullscreenControl(), 'top-right');

    // Wait for map to load before adding layers
    newMap.on('load', () => {
      // Add GeoJSON source
      newMap.addSource('countries-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'United States' },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-125, 25], [-125, 49], [-66, 49], [-66, 25], [-125, 25]
                ]]
              }
            },
            {
              type: 'Feature',
              properties: { name: 'Brazil' },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-73, -33], [-73, 5], [-34, 5], [-34, -33], [-73, -33]
                ]]
              }
            }
          ]
        }
      });

      // Add layers
      newMap.addLayer({
        id: 'countries-layer',
        type: 'fill',
        source: 'countries-source',
        paint: {
          'fill-color': '#088',
          'fill-opacity': 0.5
        }
      });

      newMap.addLayer({
        id: 'countries-outline',
        type: 'line',
        source: 'countries-source',
        paint: {
          'line-color': '#000',
          'line-width': 2,
          'line-opacity': 1.0
        }
      });

      newMap.addLayer({
        id: 'country-points',
        type: 'circle',
        source: 'countries-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Set map state to trigger LayerControlReact mount
      setMap(newMap);
    });

    // Cleanup
    return () => {
      newMap.remove();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Info Panel */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'white',
        padding: '15px',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '320px',
        zIndex: 1
      }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
          MapLibre Layer Control - React Example
        </h2>
        <p style={{ margin: '5px 0', fontSize: '13px', color: '#666' }}>
          This example demonstrates the React integration of maplibre-gl-layer-control.
        </p>
        <ul style={{ margin: '10px 0', paddingLeft: '20px', fontSize: '13px', color: '#666' }}>
          <li>Top-right corner has navigation, fullscreen, and layer controls</li>
          <li>Click the layers icon (bottom control) to open the layer control</li>
          <li>Toggle layer visibility with checkboxes</li>
          <li>Adjust opacity with sliders</li>
          <li>Click the gear icon to edit layer styles</li>
        </ul>
      </div>

      {/* Map Container */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Layer Control (only rendered after map loads) */}
      {map && (
        <LayerControlReact
          map={map}
          position="top-right"
          collapsed={false}
          layers={['countries-layer', 'countries-outline', 'country-points']}
          panelWidth={360}
          panelMinWidth={240}
          panelMaxWidth={450}
        />
      )}
    </div>
  );
}
