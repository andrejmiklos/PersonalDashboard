import { defineConfig } from 'vite';

// The admin app runs in a current phone or desktop browser; only the tile preview shares code with the
// Chrome 95 tablet (packages/tiles).
export default defineConfig({
  base: '/admin/',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    target: 'es2022',
    outDir: '../../dist/public/admin',
    // Only the admin subfolder; other apps write next to it in dist/public.
    emptyOutDir: true,
  },
  // `vite` alone (UI work): the API comes from `wrangler dev`.
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
