import { defineConfig, type Plugin } from 'vite';

/** New id per build; the Worker reads it from version.json and the tablet reloads when it changes. */
const APP_VERSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function versionFile(): Plugin {
  return {
    name: 'dashboard-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

// The tablet runs Chrome 95 (docs/tablet-compat-results.md).
export default defineConfig(({ command }) => ({
  base: '/display/',
  define: {
    __APP_VERSION__: JSON.stringify(command === 'build' ? APP_VERSION : 'dev'),
  },
  plugins: [versionFile()],
  build: {
    target: 'chrome95',
    outDir: '../../dist/public/display',
    // Only the display subfolder; other apps write next to it in dist/public.
    emptyOutDir: true,
    // Chrome 95 supports <link rel="modulepreload"> natively.
    modulePreload: { polyfill: false },
  },
}));
