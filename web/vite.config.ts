import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Same-origin in dev like in production: the Go server runs on :8080.
  server: { proxy: { '/api': 'http://localhost:8080' } },
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
});
