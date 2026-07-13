import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Manual chunking: split heavy vendor libs into cacheable chunks so the
        // main bundle shrinks and repeat-visit caching works. The previous
        // 650KB main bundle was dragging PageSpeed scores.
        // Function form (not object form): vite 8's rolldown bundler only
        // accepts a function here — the object form fails the build.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (/node_modules\/(framer-motion|motion-dom|motion-utils|lucide-react|sonner|cmdk)\//.test(id)) return 'vendor-ui';
          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id)) return 'vendor-charts';
          if (/node_modules\/(react-markdown|remark-[^/]+|rehype-[^/]+|micromark[^/]*|mdast-[^/]+|hast-[^/]+|unified|unist-[^/]+|vfile[^/]*|property-information|space-separated-tokens|comma-separated-tokens|trim-lines|devlop|bail|trough|is-plain-obj|decode-named-character-reference|character-entities[^/]*|markdown-table|ccount|escape-string-regexp|longest-streak|zwitch)\//.test(id)) return 'vendor-markdown';
          if (/node_modules\/@supabase\//.test(id)) return 'vendor-supabase';
        },
      },
    },
  },
});
