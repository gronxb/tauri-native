import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  entry: './src/index.ts',
  fixedExtension: true,
  format: 'esm',
  outDir: 'dist',
  platform: 'node',
});
