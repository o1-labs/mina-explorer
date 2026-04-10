import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// VITE_BASE_PATH overrides the served subdirectory at build time. Defaults
// to '/mina-explorer/' so the GitHub Pages build is unchanged. The Docker
// image build passes VITE_BASE_PATH=/ so the container serves at the root.
// Read from process.env (not import.meta.env) — vite.config.ts runs in Node.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/mina-explorer/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
