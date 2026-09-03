import { defineConfig } from 'vite';
// @ts-expect-error The official scaffold avoids adding @types/node for one env read.
import process from 'node:process';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
