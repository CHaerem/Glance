import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public/src',
  base: '/js/',
  build: {
    outDir: '../js/dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/src/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'public/src'),
      '@features': resolve(__dirname, 'public/src/features'),
      '@utils': resolve(__dirname, 'public/src/utils'),
      '@types': resolve(__dirname, 'public/src/types'),
    },
  },
});
