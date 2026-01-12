import maplibregl from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';

// Import styles
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

// Define the basemap style URL as a constant for reuse
const BASEMAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

// Create the map
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE_URL,
  center: [-74.5, 40],
  zoom: 9
});

// Add navigation control
map.addControl(new maplibregl.NavigationControl(), 'top-right');

map.on('load', () => {
  // Add a GeoJSON source with sample data
  map.addSource('regions', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Region A' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-75, 39], [-75, 41], [-73, 41], [-73, 39], [-75, 39]
            ]]
          }
        },
        {
          type: 'Feature',
          properties: { name: 'Region B' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-76, 40], [-76, 42], [-74, 42], [-74, 40], [-76, 40]
            ]]
          }
        }
      ]
    }
  });

  // Add fill layer
  map.addLayer({
    id: 'regions-fill',
    type: 'fill',
    source: 'regions',
    paint: {
      'fill-color': '#088',
      'fill-opacity': 0.5
    }
  });

  // Add outline layer
  map.addLayer({
    id: 'regions-outline',
    type: 'line',
    source: 'regions',
    paint: {
      'line-color': '#000',
      'line-width': 2
    }
  });

  // Add circle layer for centroids
  map.addLayer({
    id: 'regions-points',
    type: 'circle',
    source: 'regions',
    paint: {
      'circle-radius': 6,
      'circle-color': '#ff0000',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Create the layer control
  // Option 1: Control specific layers
  const layerControl = new LayerControl({
    collapsed: false,
    layers: ['regions-fill', 'regions-outline', 'regions-points'],
    panelWidth: 360,
    panelMinWidth: 240,
    panelMaxWidth: 450
  });

  // Option 2: Auto-detect layers with basemapStyleUrl for reliable detection
  // By providing basemapStyleUrl, all layers from the basemap are grouped under "Background"
  // and user-added layers are shown individually in the control
  // const layerControl = new LayerControl({
  //   collapsed: false,
  //   basemapStyleUrl: BASEMAP_STYLE_URL
  // });

  // Option 3: Auto-detect all layers without basemapStyleUrl (uses heuristic detection)
  // const layerControl = new LayerControl({
  //   collapsed: false
  // });

  // Add the control to the map
  map.addControl(layerControl, 'top-right');

  console.log('Map and layer control loaded successfully!');
});
