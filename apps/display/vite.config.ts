import { defineConfig } from 'vite';

// The tablet runs Chrome 95 (docs/tablet-compat-results.md).
export default defineConfig({
  base: '/display/',
  build: {
    target: 'chrome95',
    outDir: '../../dist/public/display',
    // Only the display subfolder; other apps write next to it in dist/public.
    emptyOutDir: true,
    // Chrome 95 supports <link rel="modulepreload"> natively.
    modulePreload: { polyfill: false },
  },
});
