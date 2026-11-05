import { defineConfig } from 'vite';

export default defineConfig({
  // Serve index.html from src/ during `npm start` so there is no index.html in the repo root
  root: 'src',
  // Use relative base path ('./') so docs/index.html loads ./assets/... cleanly on GitHub Pages
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  test: {
    root: '.',
  },
});
