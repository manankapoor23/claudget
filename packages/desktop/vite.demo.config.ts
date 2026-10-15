import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
    // Same as the renderer in electron.vite.config.ts: zustand must get the
    // app's React.
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
