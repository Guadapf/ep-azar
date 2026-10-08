import { build } from 'vite';
await build({
  configFile: false,
  build: { target: 'chrome120', rollupOptions: { input: 'popup.html' } }
});
await build({
  configFile: false, publicDir: false,
  build: {
    target: 'chrome120', emptyOutDir: false,
    lib: { entry: 'src/content.ts', name: 'NetflixRandomEpisode', formats: ['iife'], fileName: () => 'content.js' }
  }
});
await build({
  configFile: false, publicDir: false,
  build: {
    target: 'chrome120', emptyOutDir: false,
    lib: { entry: 'src/background.ts', name: 'StreamingRandomBackground', formats: ['iife'], fileName: () => 'background.js' }
  }
});
