import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Freebuff: HMR desativado e bind 0.0.0.0 (a plataforma injeta PORT)
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    hmr: false,
    allowedHosts: true, // preview do Freebuff usa domínio próprio (e2b.app)
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
});
