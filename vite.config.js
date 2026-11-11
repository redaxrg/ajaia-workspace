import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(?:@tiptap|prosemirror)\//.test(id)) return 'editor-vendor';
          if (/node_modules\/(?:react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
});
