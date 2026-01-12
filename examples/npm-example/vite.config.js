import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'maplibre-gl-layer-control/style.css': resolve(__dirname, '../../dist/maplibre-gl-layer-control.css'),
      'maplibre-gl-layer-control': resolve(__dirname, '../../dist/index.mjs'),
    }
  }
});
