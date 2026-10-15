import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// `build.externalizeDeps` (electron-vite 5+; it replaced `externalizeDepsPlugin`)
// externalises packages listed in `dependencies` (chokidar, zod,
// electron-updater) while bundling everything else — including the workspace
// package `@claude-widget/core`, which is a devDependency. That keeps the core
// inlined into the main bundle and leaves only true runtime deps in
// node_modules. It defaults to on for main and preload; it's spelled out here
// so the behaviour doesn't hinge on a default.
//
// Vite 8 bundles with Rolldown, so the input lives under `rolldownOptions`
// (`rollupOptions` is a deprecated alias).
export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      sourcemap: true,
      rolldownOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      sourcemap: true,
      rolldownOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
      // Resolve React from the app, wherever it's imported from. npm hoists
      // zustand to the root node_modules while react stays in
      // packages/desktop/node_modules, so zustand's own `import 'react'`
      // finds nothing; without this, Vite swaps in a stub that throws at load
      // and the renderer bundle is empty. @vitejs/plugin-react added this
      // dedupe itself up to v4; v5 stopped.
      dedupe: ['react', 'react-dom'],
    },
    plugins: [react()],
    build: {
      sourcemap: true,
      rolldownOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
