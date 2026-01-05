# maplibre-gl-layer-control

A comprehensive layer control for MapLibre GL with advanced styling capabilities. Built with TypeScript and React, providing both vanilla JavaScript and React integration options.

## Features

- ✅ **Auto-detection** - Automatically detects layer properties (opacity, visibility) and generates friendly names
- ✅ **Layer visibility toggle** - Checkbox control for each layer
- ✅ **Layer opacity control** - Smooth opacity slider with type-aware property mapping
- ✅ **Resizable panel** - Adjustable panel width (240-420px) with keyboard support
- ✅ **Advanced style editor** - Per-layer-type styling controls:
  - **Fill layers**: color, opacity, outline-color
  - **Line layers**: color, width, opacity, blur
  - **Circle layers**: color, radius, opacity, blur, stroke properties
  - **Symbol layers**: text-color, text-halo-color, halo-width, text/icon-opacity
  - **Raster layers**: opacity, brightness, saturation, contrast, hue-rotate
- ✅ **Dynamic layer detection** - Automatically detect and manage new layers
- ✅ **Background layer grouping** - Control all basemap layers as one group
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

## API Documentation

See [docs/API.md](docs/API.md) for complete API documentation.

## Examples

See [docs/EXAMPLES.md](docs/EXAMPLES.md) for more usage examples.

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
