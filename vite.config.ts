import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('pdf-lib') || id.includes('fontkit')) return 'vendor-pdflib';
          if (id.includes('docx') || id.includes('jszip')) return 'vendor-docx';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          return 'vendor-core';
        },
      },
    },
  },
});
