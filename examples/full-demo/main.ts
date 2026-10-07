import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LayerControl, type CustomLayerAdapter, type LayerGroupState, type LayerState } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(workerUrl);

// Define the basemap style URL as a constant so it can be reused
const BASEMAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Create the map
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE_URL,
  center: [0, 0],
  zoom: 2
});

// Add navigation controls to top-right
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control to top-right (after navigation)
map.addControl(new maplibregl.FullscreenControl(), 'top-right');


// Keep native IDs as the adapter IDs: the control retains native symbols,
// pattern previews, style editors, bounds and layer reordering.
function createDemoAdapter(): CustomLayerAdapter {
  const groups: LayerGroupState[] = [
    { id: 'patterns', name: 'Image patterns', visible: true, opacity: 1, collapsed: false },
    { id: 'countries', name: 'Country layers', visible: true, opacity: 1, collapsed: false },
    { id: 'country-markers', name: 'Outlines & centers', parentId: 'countries', visible: true, opacity: 1, collapsed: false },
    { id: 'overlays', name: 'Raster overlays', visible: true, opacity: 1, collapsed: false },
  ];
  type OpacityProperty = 'fill-opacity' | 'line-opacity' | 'circle-opacity' | 'circle-stroke-opacity' | 'raster-opacity';
  const layers: Record<string, LayerState & { groupId?: string; opacityProperties: OpacityProperty[] }> = {
    'regular-stripes': { name: 'Regular image stripes', visible: true, opacity: 1, groupId: 'patterns', opacityProperties: ['fill-opacity'] },
    // Top-level on purpose: the single SDF layer needs no folder of its own.
    'sdf-pink': { name: 'SDF dots · pink', visible: true, opacity: 1, opacityProperties: ['fill-opacity'] },
    'countries-layer': { name: 'Country fills', visible: true, opacity: 0.5, groupId: 'countries', opacityProperties: ['fill-opacity'] },
    'countries-outline': { name: 'Country outlines', visible: true, opacity: 1, groupId: 'country-markers', opacityProperties: ['line-opacity'] },
    'country-points': { name: 'Country centers', visible: true, opacity: 0.8, groupId: 'country-markers', opacityProperties: ['circle-opacity', 'circle-stroke-opacity'] },
    'raster-layer': { name: 'OpenStreetMap overlay', visible: true, opacity: 0.3, groupId: 'overlays', opacityProperties: ['raster-opacity'] },
  };

  function applyLayer(layerId: string): void {
    const layer = layers[layerId];
    // Removed native layers must not be resurrected by a folder change.
    if (!map.getLayer(layerId)) return;
    let visible = layer.visible;
    let opacity = layer.opacity;
    let group = groups.find(group => group.id === layer.groupId);
    while (group) {
      visible = visible && group.visible;
      opacity *= group.opacity;
      group = groups.find(parent => parent.id === group!.parentId);
    }
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    for (const property of layer.opacityProperties) {
      map.setPaintProperty(layerId, property, opacity);
    }
  }

  function applyGroup(groupId: string): void {
    for (const layerId of Object.keys(layers)) {
      let group = groups.find(group => group.id === layers[layerId].groupId);
      while (group) {
        if (group.id === groupId) {
          applyLayer(layerId);
          break;
        }
        group = groups.find(parent => parent.id === group!.parentId);
      }
    }
  }

  return {
    type: 'full-demo',
    getLayerIds: () => Object.keys(layers).filter(id => !!map.getLayer(id)),
    getLayerState: id => layers[id] ? { ...layers[id] } : null,
    getName: id => layers[id].name,
    setVisibility: (id, visible) => {
      layers[id].visible = visible;
      applyLayer(id);
    },
    setOpacity: (id, opacity) => {
      layers[id].opacity = opacity;
      applyLayer(id);
    },
    getGroups: () => groups.map(group => ({ ...group })),
    getLayerGroupId: id => layers[id]?.groupId,
    setGroupVisibility: (id, visible) => {
      groups.find(group => group.id === id)!.visible = visible;
      applyGroup(id);
    },
    setGroupOpacity: (id, opacity) => {
      groups.find(group => group.id === id)!.opacity = opacity;
      applyGroup(id);
    },
    setGroupCollapsed: (id, collapsed) => {
      groups.find(group => group.id === id)!.collapsed = collapsed;
    },
  };
}
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

  // Circles need point geometries, not the polygon source used by the fills.
  map.addSource('country-centers', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: geojson.features.map(feature => {
        const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0];
        return {
          type: 'Feature',
          properties: feature.properties,
          geometry: { type: 'Point', coordinates: [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2] },
        };
      }),
    },
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
    source: 'country-centers',
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

  // Reuse the pattern-fill example's RGBA stripes and alpha distance field.
  // Register images before adding fills so neither the map nor preview has
  // to wait for a sprite download.
  const size = 32;
  const dots = new Uint8Array(size * size * 4);
  const stripes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const distance = 8 - Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      // SDF contour at 0.75; MapLibre and the preview decode the same alpha.
      dots[i + 3] = Math.round(255 * Math.max(0, Math.min(1, 0.75 + distance / 8)));
      stripes.set([30, 160, 100, x % 16 < 8 ? 255 : 0], i);
    }
  }
  map.addImage('demo-dots', { width: size, height: size, data: dots }, { sdf: true, pixelRatio: 2 });
  map.addImage('demo-stripes', { width: size, height: size, data: stripes }, { pixelRatio: 2 });

  // Each pattern gets its own [west, south, east, north] box. The SDF dots sit over Europe.
  const patterns = [
    { id: 'regular-stripes', image: 'demo-stripes', color: '#1ea064', bounds: [-30, -14, -6, 10] },
    { id: 'sdf-pink', image: 'demo-dots', color: '#f472b6', bounds: [0, 40, 24, 54] },
  ];
  patterns.forEach(({ id, image, color, bounds: [west, south, east, north] }) => {
    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [
          [[west, south], [east, south], [east, north], [west, north], [west, south]],
        ] },
      },
    });
    map.addLayer({
      id, type: 'fill', source: id,
      paint: { 'fill-pattern': image, 'fill-color': color, 'fill-opacity': 1 },
    });
  });

  const adapter = createDemoAdapter();

  // Create the layer control AFTER adding custom layers
  // By providing basemapStyleUrl, the control reliably distinguishes basemap layers
  // from user-added layers - all basemap layers are grouped under "Background"
  const layerControl = new LayerControl({
    collapsed: false, // Start expanded to show features
    panelWidth: 350,
    panelMinWidth: 240,
    panelMaxWidth: 960,
    // panelMaxHeight omitted so the panel fills the available vertical space
    showStyleEditor: true,
    showOpacitySlider: true,
    basemapStyleUrl: BASEMAP_STYLE_URL, // Enables reliable basemap vs user layer detection
    customLayerAdapters: [adapter],
    layerStates: Object.fromEntries(adapter.getLayerIds().map(id => [id, { name: adapter.getName(id) }])),
  });

  // Add the control to the map
  map.addControl(layerControl, 'top-right');

  //Add Globe control to top-right
  map.addControl(new maplibregl.GlobeControl(), 'top-right');

  console.log('Full demo loaded with layer control');
});
