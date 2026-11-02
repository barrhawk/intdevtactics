import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve('src/three-isometric-engine'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
