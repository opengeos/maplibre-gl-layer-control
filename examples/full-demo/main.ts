import maplibregl from 'maplibre-gl';
import { LayerControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Define the basemap style URL as a constant so it can be reused
const BASEMAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Create the map
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE_URL,
  center: [0, 0], // New York area
  zoom: 2
});

// Add navigation controls to top-right
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control to top-right (after navigation)
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Wait for the map to load
map.on('load', () => {
  // Get all layers from the style
  const style = map.getStyle();
  if (!style || !style.layers) {
    return;
  }

  // Create a simple test GeoJSON (world bounding boxes for a few countries)
  const geojson: GeoJSON.FeatureCollection = {
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
      },
      {
        type: 'Feature',
        properties: { name: 'China' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [73, 18], [73, 53], [135, 53], [135, 18], [73, 18]
          ]]
        }
      },
      {
        type: 'Feature',
        properties: { name: 'Australia' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [113, -44], [113, -10], [154, -10], [154, -44], [113, -44]
          ]]
        }
      }
    ]
  };

  // Add GeoJSON source
  map.addSource('countries-source', {
    type: 'geojson',
    data: geojson
  });

  // Add fill layer (ensure it's on top of basemap)
  map.addLayer({
    id: 'countries-layer',
    type: 'fill',
    source: 'countries-source',
    paint: {
      'fill-color': '#088',
      'fill-opacity': 0.5
    }
  });

  // Add outline layer (on top of fill)
  map.addLayer({
    id: 'countries-outline',
    type: 'line',
    source: 'countries-source',
    paint: {
      'line-color': '#000',
      'line-width': 2,
      'line-opacity': 1.0
    }
  });

  // Add circle layer (points at country centers)
  map.addLayer({
    id: 'country-points',
    type: 'circle',
    source: 'countries-source',
    paint: {
      'circle-radius': 8,
      'circle-color': '#ef4444',
      'circle-opacity': 0.8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 1
    }
  });

  // Add a raster layer (using MapLibre demo tiles as example)
  map.addSource('raster-source', {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '&copy; OpenStreetMap contributors'
  });

  map.addLayer({
    id: 'raster-layer',
    type: 'raster',
    source: 'raster-source',
    paint: {
      'raster-opacity': 0.3
    }
  }, 'countries-layer'); // Insert below countries layer

  // Create the layer control AFTER adding custom layers
  // By providing basemapStyleUrl, the control reliably distinguishes basemap layers
  // from user-added layers - all basemap layers are grouped under "Background"
  const layerControl = new LayerControl({
    collapsed: false, // Start expanded to show features
    panelWidth: 350,
    panelMinWidth: 240,
    panelMaxWidth: 450,
    panelMaxHeight: 400,
    showStyleEditor: true,
    showOpacitySlider: true,
    basemapStyleUrl: BASEMAP_STYLE_URL, // Enables reliable basemap vs user layer detection
  });

  // Add the control to the map
  map.addControl(layerControl, 'top-right');

  //Add Globe control to top-right
  map.addControl(new maplibregl.GlobeControl(), 'top-right');

  console.log('Full demo loaded with layer control');
});
