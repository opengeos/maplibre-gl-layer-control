import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/maplibre-gl-layer-control/',
  build: {
    outDir: 'dist-examples',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        basic: resolve(__dirname, 'examples/basic/index.html'),
        'full-demo': resolve(__dirname, 'examples/full-demo/index.html'),
        'dynamic-layers': resolve(__dirname, 'examples/dynamic-layers/index.html'),
        'background-legend': resolve(__dirname, 'examples/background-legend/index.html'),
        react: resolve(__dirname, 'examples/react/index.html'),
        cdn: resolve(__dirname, 'examples/cdn/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
