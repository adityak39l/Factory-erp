import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/Factory-erp/' : '/',
  server: {
    host: true,
    port: 5173,
    // The frontend calls /api/* and Vite forwards it to the backend in development,
    // so there is no CORS setup to worry about while working locally.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
}));
