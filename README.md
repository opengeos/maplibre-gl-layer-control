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
| `showStyleEditor` | `boolean` | `true` | Show gear icon for style editor |
| `showOpacitySlider` | `boolean` | `true` | Show opacity slider for layers |
| `showLayerSymbol` | `boolean` | `true` | Show layer type symbols (colored icons) next to layer names |

### LayerState

```typescript
interface LayerState {
  visible: boolean;    // Layer visibility
  opacity: number;     // Opacity (0-1)
  name?: string;       // Display name (auto-generated if omitted)
}
```

## Examples

See the [examples](./examples) folder for complete working examples:

- **[basic](./examples/basic)** - Simple vanilla JavaScript example
- **[full-demo](./examples/full-demo)** - Full demo with multiple layer types
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

## License

MIT © Qiusheng Wu

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
