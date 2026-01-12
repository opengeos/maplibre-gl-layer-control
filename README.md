# maplibre-gl-layer-control

[![npm version](https://img.shields.io/npm/v/maplibre-gl-layer-control.svg)](https://www.npmjs.com/package/maplibre-gl-layer-control)
[![npm downloads](https://img.shields.io/npm/dm/maplibre-gl-layer-control.svg)](https://www.npmjs.com/package/maplibre-gl-layer-control)
[![license](https://img.shields.io/npm/l/maplibre-gl-layer-control.svg)](https://github.com/opengeos/maplibre-gl-layer-control/blob/main/LICENSE)

A comprehensive layer control for MapLibre GL with advanced styling capabilities. Built with TypeScript and React, providing both vanilla JavaScript and React integration options.

## Features

- ✅ **Auto-detection** - Automatically detects layer properties (opacity, visibility) and generates friendly names
- ✅ **Layer visibility toggle** - Checkbox control for each layer
- ✅ **Layer opacity control** - Smooth opacity slider with type-aware property mapping
- ✅ **Layer symbols** - Visual type indicators (colored shapes) next to layer names, auto-detected from layer paint properties
- ✅ **Resizable panel** - Adjustable panel width (240-420px) with keyboard support
- ✅ **Advanced style editor** - Per-layer-type styling controls:
  - **Fill layers**: color, opacity, outline-color
  - **Line layers**: color, width, opacity, blur
  - **Circle layers**: color, radius, opacity, blur, stroke properties
  - **Symbol layers**: text-color, text-halo-color, halo-width, text/icon-opacity
  - **Raster layers**: opacity, brightness, saturation, contrast, hue-rotate
- ✅ **Dynamic layer detection** - Automatically detect and manage new layers
- ✅ **Background layer grouping** - Control all basemap layers as one group
- ✅ **Background layer legend** - Gear icon to toggle individual background layer visibility
- ✅ **Accessibility** - Full ARIA support and keyboard navigation
- ✅ **TypeScript** - Full type safety and IntelliSense support
- ✅ **React integration** - Optional React components and hooks
- ✅ **Custom layer adapters** - Integrate non-MapLibre layers (deck.gl, Zarr, etc.)

## Installation

```bash
npm install maplibre-gl-layer-control
```

## Quick Start

### Vanilla JavaScript

```typescript
import maplibregl from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';
import 'maplibre-gl-layer-control/style.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2
});

map.on('load', () => {
  // Add your custom layers
  map.addLayer({
    id: 'my-layer',
    type: 'fill',
    source: 'my-source',
    paint: {
      'fill-color': '#088',
      'fill-opacity': 0.5
    }
  });

  // Create layer control with auto-detection
  // Option 1: Specify which layers to control (recommended for most use cases)
  // - Shows specified layers with auto-detected opacity, visibility, and friendly names
  // - Groups all other layers as "Background"
  const layerControl = new LayerControl({
    collapsed: false,
    layers: ['my-layer'], // LayerControl auto-detects opacity, visibility, and generates friendly names
    panelWidth: 340,
    panelMinWidth: 240,
    panelMaxWidth: 450
  });

  // Option 2: Show ALL layers individually (no layers parameter)
  // - Auto-detects ALL layers from the map
  // - Generates friendly names from layer IDs (e.g., 'countries-layer' → 'Countries Layer')
  // const layerControl = new LayerControl({
  //   collapsed: false,
  //   panelWidth: 340,
  //   panelMinWidth: 240,
  //   panelMaxWidth: 450
  // });

  // Option 3: Manually specify layer states (for full control over names)
  // const layerControl = new LayerControl({
  //   collapsed: false,
  //   layerStates: {
  //     'my-layer': {
  //       visible: true,
  //       opacity: 0.5,
  //       name: 'My Custom Layer Name'
  //     }
  //   }
  // });

  map.addControl(layerControl, 'top-right');
});
```

### React

```typescript
import { useState, useEffect } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { LayerControlReact } from 'maplibre-gl-layer-control/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

function MapComponent() {
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    const newMap = new maplibregl.Map({
      container: 'map',
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 0],
      zoom: 2
    });

    newMap.on('load', () => {
      // Add your custom layers here
      setMap(newMap);
    });

    return () => newMap.remove();
  }, []);

  return (
    <div>
      <div id="map" style={{ width: '100%', height: '600px' }} />
      {map && (
        <LayerControlReact
          map={map}
          position="top-right"
          layers={['my-layer']}
          collapsed={false}
        />
      )}
    </div>
  );
}
```

## API

### LayerControl Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `collapsed` | `boolean` | `true` | Start with panel collapsed |
| `layers` | `string[]` | `undefined` | Layer IDs to control (auto-detects all if omitted) |
| `layerStates` | `Record<string, LayerState>` | `undefined` | Manual layer state configuration |
| `panelWidth` | `number` | `320` | Initial panel width in pixels |
| `panelMinWidth` | `number` | `240` | Minimum panel width |
| `panelMaxWidth` | `number` | `420` | Maximum panel width |
| `panelMaxHeight` | `number` | `600` | Maximum panel height (scrollable when exceeded) |
| `showStyleEditor` | `boolean` | `true` | Show gear icon for style editor |
| `showOpacitySlider` | `boolean` | `true` | Show opacity slider for layers |
| `showLayerSymbol` | `boolean` | `true` | Show layer type symbols (colored icons) next to layer names |
| `excludeDrawnLayers` | `boolean` | `true` | Exclude layers from drawing libraries (Geoman, Mapbox GL Draw, etc.) |
| `customLayerAdapters` | `CustomLayerAdapter[]` | `undefined` | Adapters for non-MapLibre layers (deck.gl, Zarr, etc.) |
| `basemapStyleUrl` | `string` | `undefined` | URL of basemap style JSON for reliable layer detection (see below) |

### LayerState

```typescript
interface LayerState {
  visible: boolean;    // Layer visibility
  opacity: number;     // Opacity (0-1)
  name?: string;       // Display name (auto-generated if omitted)
}
```

### Basemap Style URL Detection

When using auto-detection (without specifying `layers`), the control needs to distinguish between basemap layers and user-added layers. By default, it uses heuristics based on source detection, which may not always be reliable.

For **reliable detection**, provide the `basemapStyleUrl` option with the same URL used for the map's style:

```typescript
const BASEMAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE_URL,
  center: [0, 0],
  zoom: 2
});

map.on('load', () => {
  // Add your custom layers
  map.addLayer({
    id: 'my-custom-layer',
    type: 'fill',
    source: 'my-source',
    paint: { 'fill-color': '#088' }
  });

  // Create layer control with basemapStyleUrl for reliable detection
  const layerControl = new LayerControl({
    collapsed: false,
    basemapStyleUrl: BASEMAP_STYLE_URL  // All layers from this URL go to "Background"
  });

  map.addControl(layerControl, 'top-right');
});
```

When `basemapStyleUrl` is provided:
- The control fetches the style JSON and extracts all layer IDs
- Layers that exist in the basemap style are grouped under "Background"
- All other layers (user-added) are shown individually in the control
- New layers added later are automatically detected as user layers

### Automatic Detection Without basemapStyleUrl

Even without `basemapStyleUrl`, the control uses source-based heuristics to detect user-added layers. Custom MapLibre layers (using `map.addLayer()`) are automatically detected whether they are added **before** or **after** the layer control - no custom adapter is needed for standard MapLibre layer types!

```typescript
map.on('load', () => {
  // Add custom layers BEFORE the control - they will be detected
  map.addSource('my-source', { type: 'geojson', data: myGeoJson });
  map.addLayer({ id: 'my-layer', type: 'fill', source: 'my-source', ... });

  // Add the control - it detects existing custom layers
  const layerControl = new LayerControl({ collapsed: false });
  map.addControl(layerControl, 'top-right');

  // Add more layers AFTER the control - they will also be detected automatically
  map.addLayer({ id: 'another-layer', type: 'circle', source: 'another-source', ... });
});
```

## Examples

See the [examples](./examples) folder for complete working examples:

- **[basic](./examples/basic)** - Simple vanilla JavaScript example
- **[full-demo](./examples/full-demo)** - Full demo with multiple layer types
- **[dynamic-layers](./examples/dynamic-layers)** - Auto-detect layers added before or after control
- **[background-legend](./examples/background-legend)** - Background layer visibility control
- **[react](./examples/react)** - React integration example

### Layer Symbols

The layer control displays visual symbols (colored icons) next to each layer name to indicate the layer type. Symbols are automatically generated based on the layer's type and paint properties:

| Layer Type | Symbol |
|------------|--------|
| `fill` | Colored rectangle with border |
| `line` | Horizontal line |
| `circle` | Colored circle |
| `symbol` | Marker/pin icon |
| `raster` | Gradient rectangle |
| `heatmap` | Orange-red gradient |
| `hillshade` | Gray gradient |
| `fill-extrusion` | 3D rectangle |
| `background` | Rectangle with inner border |
| Background group | Stacked layers icon |

The symbol color is automatically extracted from the layer's paint properties (e.g., `fill-color`, `line-color`, `circle-color`). If a color cannot be determined, a neutral gray is used.

To disable layer symbols:

```typescript
const layerControl = new LayerControl({
  showLayerSymbol: false
});
```

### Background Layer Legend

When using the `layers` option to specify specific layers, all other layers are grouped under a "Background" entry. The Background layer includes a **gear icon** that opens a detailed legend panel showing:

- Individual visibility toggles for each background layer
- Layer type indicators (fill, line, symbol, etc.)
- Quick "Show All" / "Hide All" buttons
- **"Only rendered" filter** - Shows only layers that are currently rendered in the map viewport
- Indeterminate checkbox state when some layers are hidden

This allows fine-grained control over which basemap layers are visible while maintaining a simplified layer control interface.

### Custom Layer Adapters

The layer control supports non-MapLibre layers (such as deck.gl or Zarr layers) through the Custom Layer Adapter interface. This allows you to integrate any custom layer type with the layer control's visibility toggle, opacity slider, and layer list.

#### CustomLayerAdapter Interface

```typescript
interface CustomLayerAdapter {
  /** Unique type identifier for this adapter (e.g., 'cog', 'zarr', 'deck') */
  type: string;

  /** Get all layer IDs managed by this adapter */
  getLayerIds(): string[];

  /** Get the current state of a layer */
  getLayerState(layerId: string): LayerState | null;

  /** Set layer visibility */
  setVisibility(layerId: string, visible: boolean): void;

  /** Set layer opacity (0-1) */
  setOpacity(layerId: string, opacity: number): void;

  /** Get display name for a layer */
  getName(layerId: string): string;

  /** Get layer symbol type for UI display (optional) */
  getSymbolType?(layerId: string): string;

  /**
   * Subscribe to layer changes (add/remove).
   * Returns an unsubscribe function.
   */
  onLayerChange?(callback: (event: 'add' | 'remove', layerId: string) => void): () => void;
}
```

#### Implementing a Custom Adapter

Here's an example of implementing an adapter for deck.gl layers:

```typescript
import type { CustomLayerAdapter, LayerState } from 'maplibre-gl-layer-control';
import type { MapboxOverlay } from '@deck.gl/mapbox';

class DeckLayerAdapter implements CustomLayerAdapter {
  readonly type = 'deck';

  private deckOverlay: MapboxOverlay;
  private deckLayers: Map<string, any>;
  private changeCallbacks: Array<(event: 'add' | 'remove', layerId: string) => void> = [];

  constructor(deckOverlay: MapboxOverlay, deckLayers: Map<string, any>) {
    this.deckOverlay = deckOverlay;
    this.deckLayers = deckLayers;
  }

  getLayerIds(): string[] {
    return Array.from(this.deckLayers.keys());
  }

  getLayerState(layerId: string): LayerState | null {
    const layer = this.deckLayers.get(layerId);
    if (!layer?.props) return null;

    return {
      visible: layer.props.visible !== false,
      opacity: layer.props.opacity ?? 1,
      name: this.getName(layerId),
    };
  }

  setVisibility(layerId: string, visible: boolean): void {
    const layer = this.deckLayers.get(layerId);
    if (!layer?.clone) return;

    // deck.gl layers are immutable; clone with new props
    const updatedLayer = layer.clone({ visible });
    this.deckLayers.set(layerId, updatedLayer);
    this.updateOverlay();
  }

  setOpacity(layerId: string, opacity: number): void {
    const layer = this.deckLayers.get(layerId);
    if (!layer?.clone) return;

    const updatedLayer = layer.clone({ opacity });
    this.deckLayers.set(layerId, updatedLayer);
    this.updateOverlay();
  }

  getName(layerId: string): string {
    return layerId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  getSymbolType(): string {
    return 'raster'; // Use raster symbol for deck.gl layers
  }

  onLayerChange(callback: (event: 'add' | 'remove', layerId: string) => void): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      const idx = this.changeCallbacks.indexOf(callback);
      if (idx >= 0) this.changeCallbacks.splice(idx, 1);
    };
  }

  // Call this when layers are added/removed
  notifyLayerAdded(layerId: string): void {
    this.changeCallbacks.forEach(cb => cb('add', layerId));
  }

  notifyLayerRemoved(layerId: string): void {
    this.changeCallbacks.forEach(cb => cb('remove', layerId));
  }

  private updateOverlay(): void {
    this.deckOverlay.setProps({ layers: Array.from(this.deckLayers.values()) });
  }
}
```

#### Using Custom Adapters

Pass your custom adapters to the `customLayerAdapters` option:

```typescript
import { LayerControl } from 'maplibre-gl-layer-control';

// Create your custom adapter
const deckAdapter = new DeckLayerAdapter(deckOverlay, deckLayers);

// Create the layer control with the adapter
const layerControl = new LayerControl({
  collapsed: false,
  customLayerAdapters: [deckAdapter]
});

map.addControl(layerControl, 'top-right');

// When you add a new deck.gl layer, notify the adapter
deckLayers.set('my-deck-layer', myDeckLayer);
deckAdapter.notifyLayerAdded('my-deck-layer');
```

#### Limitations

- **Style Editor**: The style editor (gear icon) is not available for custom layers since they don't use MapLibre's paint properties. Clicking the gear icon will show an info panel explaining this.
- **Opacity Support**: Some layer types (like deck.gl's COGLayer) may not support dynamic opacity changes due to underlying library limitations. In these cases, the opacity slider will have no effect.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Docker

The examples can be run using Docker. The image is automatically built and published to GitHub Container Registry.

### Pull and Run

```bash
# Pull the latest image
docker pull ghcr.io/opengeos/maplibre-gl-layer-control:latest

# Run the container
docker run -p 8080:80 ghcr.io/opengeos/maplibre-gl-layer-control:latest
```

Then open http://localhost:8080/maplibre-gl-layer-control/ in your browser to view the examples.

### Build Locally

```bash
# Build the image
docker build -t maplibre-gl-layer-control .

# Run the container
docker run -p 8080:80 maplibre-gl-layer-control
```

### Available Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest release |
| `x.y.z` | Specific version (e.g., `1.0.0`) |
| `x.y` | Minor version (e.g., `1.0`) |


## License

MIT © Qiusheng Wu

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
