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
        // Vendor chunking, via rolldown's native `advancedChunks` rather than
        // rollup's legacy `manualChunks`.
        //
        // DO NOT go back to `manualChunks`. Under vite 8 / rolldown its return
        // value is only a hint, and it silently misplaced React: `react` and
        // `react/cjs/react.production.min.js` ended up inside `vendor-charts`,
        // and `react/jsx-runtime` inside `vendor-markdown`. Because every page
        // needs React, that forced the browser to download recharts + d3 + 195
        // lodash modules (106 KB gzip) AND react-markdown + micromark (46 KB
        // gzip) on every single page load, including the home page, which uses
        // neither. Critical-path JS was 362 KB gzip; it is 188 KB gzip now
        // (fixing this alone accounted for 150 KB of that; the rest came from
        // moving sonner/cmdk into the lazy vendor-overlay chunk below).
        //
        // Two things keep this correct, both load-bearing:
        //   1. `priority` — react must win over any group a transitive dep
        //      might also match.
        //   2. `[\\/]` in every test — build ids use OS-native separators on
        //      Windows, so a hardcoded `/` silently matches nothing here.
        // After changing anything below, rebuild and confirm the modulepreload
        // list in dist/index.html does NOT contain vendor-charts or
        // vendor-markdown.
        advancedChunks: {
          groups: [
            { name: 'vendor-react', priority: 100, test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/ },
            { name: 'vendor-supabase', priority: 90, test: /node_modules[\\/]@supabase[\\/]/ },
            // lodash lives here on purpose: recharts is its only consumer, so
            // pinning it to the charts group keeps it off the critical path.
            { name: 'vendor-charts', priority: 80, test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|lodash)[\\/]/ },
            { name: 'vendor-markdown', priority: 70, test: /node_modules[\\/](react-markdown|remark-.+|rehype-.+|micromark.*|mdast-.+|hast-.+|unified|unist-.+|vfile.*|property-information|.*-separated-tokens|trim-lines|devlop|bail|trough|is-plain-obj|decode-named-character-reference|character-entities.*|markdown-table|ccount|escape-string-regexp|longest-streak|zwitch|style-to-.*|inline-style-parser|html-url-attributes|@ungap)[\\/]/ },
            // Split out from vendor-ui on purpose. App.jsx mounts the command
            // palette and the toast host lazily (DeferredOverlays), but that
            // only keeps them off the critical path if they land in a chunk
            // nothing eagerly imports. Left inside vendor-ui, framer-motion
            // drags them back in and the lazy mount buys nothing.
            { name: 'vendor-overlay', priority: 65, test: /node_modules[\\/](sonner|cmdk)[\\/]/ },
            { name: 'vendor-ui', priority: 60, test: /node_modules[\\/](framer-motion|motion-dom|motion-utils|lucide-react)[\\/]/ },
          ],
        },
      },
    },
  },
});
