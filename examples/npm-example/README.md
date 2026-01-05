# npm Example

This is a standalone example showing how to use `maplibre-gl-layer-control` from npm.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Then open http://localhost:5173 in your browser.

## Files

- `package.json` - Project dependencies
- `index.html` - HTML entry point
- `main.js` - JavaScript code demonstrating the layer control

## Key Imports

```javascript
import maplibregl from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';

// Don't forget the styles!
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';
```
