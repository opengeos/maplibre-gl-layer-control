# Examples

This folder contains examples for using `maplibre-gl-layer-control`.

## Installation

```bash
npm install maplibre-gl-layer-control maplibre-gl
```

## Available Examples

| Example | Description |
|---------|-------------|
| [npm-example](./npm-example) | Standalone npm project - copy this to start your own project |
| [cdn](./cdn) | Browser-only example using CDN (no build step required) |
| [basic](./basic) | Simple development example |
| [full-demo](./full-demo) | Comprehensive demo with multiple layer types |
| [background-legend](./background-legend) | Control individual background layer visibility |
| [react](./react) | React integration example |

## Quick Start with npm

The easiest way to get started is to copy the [npm-example](./npm-example) folder:

```bash
cp -r examples/npm-example my-project
cd my-project
npm install
npm run dev
```

## Basic Usage (Vanilla JavaScript)

See [basic/](./basic) for a simple example.

```javascript
import maplibregl from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2
});

map.on('load', () => {
  // Option 1: Auto-detect all layers
  const layerControl = new LayerControl({
    collapsed: false
  });

  // Option 2: Control specific layers only
  // const layerControl = new LayerControl({
  //   layers: ['my-layer-1', 'my-layer-2']
  // });

  map.addControl(layerControl, 'top-right');
});
```

### Full Demo

See [full-demo/](./full-demo) for a comprehensive example with multiple layer types (fill, line, circle, raster).

### React Integration

See [react/](./react) for React component usage.

```tsx
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { LayerControlReact } from 'maplibre-gl-layer-control/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const newMap = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 0],
      zoom: 2
    });

    newMap.on('load', () => setMap(newMap));

    return () => newMap.remove();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <LayerControlReact
          map={map}
          position="top-right"
          collapsed={false}
        />
      )}
    </div>
  );
}
```

### CDN Usage (No Build Step)

See [cdn/](./cdn) for using the library directly in the browser without a build step.

## Running Examples Locally

To run these examples in development mode:

```bash
# From the repository root
npm install
npm run dev

# Then open http://localhost:5173/examples/basic/
# or http://localhost:5173/examples/full-demo/
# or http://localhost:5173/examples/react/
```
