import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative base path ('./') so out/index.html loads JS, CSS, and assets
  // cleanly on GitHub Pages regardless of whether it's hosted at / or /<repo-name>/
  base: './',
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
});

