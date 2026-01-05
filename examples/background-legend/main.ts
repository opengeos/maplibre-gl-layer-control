import maplibregl from 'maplibre-gl';
import { LayerControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Create the map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2
});

// Add navigation control
map.addControl(new maplibregl.NavigationControl(), 'top-right');

map.on('load', () => {
  // Add a sample GeoJSON source with user layers
  map.addSource('sample-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Sample Region' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-30, -20], [-30, 20], [30, 20], [30, -20], [-30, -20]
            ]]
          }
        }
      ]
    }
  });

  // Add user layer - fill
  map.addLayer({
    id: 'sample-fill',
    type: 'fill',
    source: 'sample-source',
    paint: {
      'fill-color': '#088',
      'fill-opacity': 0.5
    }
  });

  // Add user layer - outline
  map.addLayer({
    id: 'sample-outline',
    type: 'line',
    source: 'sample-source',
    paint: {
      'line-color': '#000',
      'line-width': 2
    }
  });

  // Create layer control with specific layers
  // This triggers Background grouping for basemap layers
  const layerControl = new LayerControl({
    collapsed: false,
    layers: ['sample-fill', 'sample-outline'], // Only control these layers explicitly
    panelWidth: 320
  });

  map.addControl(layerControl, 'top-right');

  console.log('Background legend demo loaded');
  console.log('Click the gear icon on the Background layer to see individual basemap layers');
});
