import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/local-api-handler.ts',
    'src/local-api-handler-pages.ts',
    'src/local-viewer.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  treeshake: true,
  clean: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  outDir: 'dist',
  external: ['better-sqlite3'],
});
