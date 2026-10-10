import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same build works at https://<user>.github.io/berlin-transit-heatmap/ and locally.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
