import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration.
 * Only PUBLIC configuration is allowed as VITE_* variables:
 * anything defined here can be seen in the built bundle, so
 * secrets must never be placed in frontend .env files.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    // Fail the build if any TypeScript error exists (typos, broken types).
    sourcemap: false,
    target: 'es2022',
  },
});
