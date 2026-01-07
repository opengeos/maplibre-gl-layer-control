import maplibregl from 'maplibre-gl';
import { LayerControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Create map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2
});

// Add layer control when map loads
map.on('load', () => {
  // Get all layers from the style
  const layers = map.getStyle().layers;
  if (!layers) return;

  // Create layer states for the first few layers
  const layerStates: Record<string, { visible: boolean; opacity: number; name: string }> = {};

  // Pick a few interesting layers to control
  const layersToControl = layers
    .filter(layer => ['water', 'landcover', 'landuse', 'boundary', 'buildings'].some(name => layer.id.includes(name)))
    .slice(0, 5);

  layersToControl.forEach(layer => {
    const visibility = map.getLayoutProperty(layer.id, 'visibility');
    layerStates[layer.id] = {
      visible: visibility !== 'none',
      opacity: 1.0,
      name: layer.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    };
  });

  // Create and add the layer control
  const layerControl = new LayerControl({
    collapsed: false,
    layerStates,
    panelWidth: 320,
    showStyleEditor: true
  });

  map.addControl(layerControl, 'top-right');

  console.log('Layer control added with layers:', Object.keys(layerStates));
});
