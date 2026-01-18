import maplibregl from 'maplibre-gl';
import { LayerControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Dynamic Layers Example
 *
 * This example demonstrates that MapLibre layers are automatically detected
 * by the LayerControl, whether they are added BEFORE or AFTER the control.
 * No custom adapter is needed for standard MapLibre layer types!
 */

// Track how many layers we've added
let layerCount = 0;

// Create the map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-74.5, 40],
  zoom: 5
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

map.on('load', () => {
  // ============================================================
  // IMPORTANT: Add some layers BEFORE the layer control
  // These should still be detected as user-added layers!
  // ============================================================

  // Add a GeoJSON source with polygon data (BEFORE control)
  map.addSource('pre-control-regions', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Pre-Control Region' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-76, 38], [-76, 42], [-72, 42], [-72, 38], [-76, 38]
            ]]
          }
        }
      ]
    }
  });

  // Add fill layer BEFORE control
  map.addLayer({
    id: 'pre-control-fill',
    type: 'fill',
    source: 'pre-control-regions',
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0.4
    }
  });

  // Add outline layer BEFORE control
  map.addLayer({
    id: 'pre-control-outline',
    type: 'line',
    source: 'pre-control-regions',
    paint: {
      'line-color': '#166534',
      'line-width': 2
    }
  });

  layerCount = 2;
  updateStatus();

  // ============================================================
  // Now add the LayerControl
  // It should detect both basemap layers AND the pre-control layers
  // ============================================================

  const layerControl = new LayerControl({
    collapsed: false,
    panelWidth: 350,
    panelMinWidth: 240,
    panelMaxWidth: 450,
    showStyleEditor: true,
    showOpacitySlider: true,
    showLayerSymbol: true,
  });

  map.addControl(layerControl, 'top-right');

  console.log('LayerControl added. Pre-control layers should be visible in the control.');

  // ============================================================
  // Setup buttons to add more layers AFTER the control
  // These should also be automatically detected!
  // ============================================================

  // Add Fill Layer button
  document.getElementById('add-fill')?.addEventListener('click', () => {
    const sourceId = `fill-source-${Date.now()}`;
    const layerId = `dynamic-fill-${Date.now()}`;

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Dynamic Region' },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-78 + Math.random() * 4, 36 + Math.random() * 4],
                [-78 + Math.random() * 4, 40 + Math.random() * 4],
                [-74 + Math.random() * 4, 40 + Math.random() * 4],
                [-74 + Math.random() * 4, 36 + Math.random() * 4],
                [-78 + Math.random() * 4, 36 + Math.random() * 4]
              ]]
            }
          }
        ]
      }
    });

    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': `hsl(${Math.random() * 350}, 70%, 50%)`,
        'fill-opacity': 0.5
      }
    });

    layerCount++;
    updateStatus();
    disableButton('add-fill');
    console.log(`Added fill layer: ${layerId}`);
  });

  // Add Line Layer button
  document.getElementById('add-line')?.addEventListener('click', () => {
    const sourceId = `line-source-${Date.now()}`;
    const layerId = `dynamic-line-${Date.now()}`;

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Route' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [-76, 39],
                [-75, 40],
                [-74, 39.5],
                [-73, 41],
                [-72, 40]
              ]
            }
          }
        ]
      }
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4,
        'line-opacity': 0.8
      }
    });

    layerCount++;
    updateStatus();
    disableButton('add-line');
    console.log(`Added line layer: ${layerId}`);
  });

  // Add Circle Layer button
  document.getElementById('add-circle')?.addEventListener('click', () => {
    const sourceId = `circle-source-${Date.now()}`;
    const layerId = `dynamic-circles-${Date.now()}`;

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'Point 1' }, geometry: { type: 'Point', coordinates: [-74.5, 40] } },
          { type: 'Feature', properties: { name: 'Point 2' }, geometry: { type: 'Point', coordinates: [-75.5, 39.5] } },
          { type: 'Feature', properties: { name: 'Point 3' }, geometry: { type: 'Point', coordinates: [-73.5, 40.5] } },
          { type: 'Feature', properties: { name: 'Point 4' }, geometry: { type: 'Point', coordinates: [-76, 41] } },
        ]
      }
    });

    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 10,
        'circle-color': '#ef4444',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.8
      }
    });

    layerCount++;
    updateStatus();
    disableButton('add-circle');
    console.log(`Added circle layer: ${layerId}`);
  });

  // Add Raster Layer button
  document.getElementById('add-raster')?.addEventListener('click', () => {
    const sourceId = `raster-source-${Date.now()}`;
    const layerId = `dynamic-raster-${Date.now()}`;

    map.addSource(sourceId, {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors'
    });

    // Add below all other layers
    const firstLayerId = map.getStyle().layers?.[0]?.id;
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': 0.5
      }
    }, firstLayerId);

    layerCount++;
    updateStatus();
    disableButton('add-raster');
    console.log(`Added raster layer: ${layerId}`);
  });

  console.log('Dynamic layers demo ready. Click buttons to add layers!');
});

function updateStatus() {
  const countEl = document.getElementById('layer-count');
  if (countEl) {
    countEl.textContent = String(layerCount);
  }
}

function disableButton(id: string) {
  const btn = document.getElementById(id) as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = btn.textContent?.replace('➕', '✓') || btn.textContent;
  }
}
