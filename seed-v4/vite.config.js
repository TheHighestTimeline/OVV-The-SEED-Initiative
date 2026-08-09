import { defineConfig } from 'vite';

/* The world is one big module graph with no code splitting worth doing: every
   zone is needed before the first frame renders. A single chunk keeps the
   waterfall to one request and lets esbuild's tree shaking see everything. */
export default defineConfig({
  base: './',
  /* PORT lets a harness or a second checkout assign its own port instead of
     colliding on the default. */
  server: { port: Number(process.env.PORT) || 8811, host: true, open: false },
  preview: { port: Number(process.env.PORT) || 8812 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
});
