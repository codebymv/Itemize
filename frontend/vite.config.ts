import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer"
import path from 'path'

const devProxyTarget = process.env.DEV_API_PROXY_TARGET?.trim();
const devGraphqlProxyTarget =
  process.env.DEV_GRAPHQL_PROXY_TARGET?.trim() || devProxyTarget;
const devProxyOrigin = process.env.DEV_API_PROXY_ORIGIN?.trim();

const devProxy = (target: string) => ({
  target,
  changeOrigin: true,
  cookieDomainRewrite: '',
  configure(proxy: { on: (event: string, handler: (request: { setHeader: (name: string, value: string) => void }) => void) => void }) {
    if (!devProxyOrigin) return;
    proxy.on('proxyReq', (request) => {
      request.setHeader('origin', devProxyOrigin);
      request.setHeader('referer', `${devProxyOrigin.replace(/\/$/, '')}/`);
    });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'production' && process.env.ANALYZE === 'true'
      ? visualizer({ open: true, filename: 'dist/stats.html' })
      : null
  ].filter(Boolean),

  resolve: {
    // React-PDF and its worker must use our same pinned pdfjs-dist version.
    dedupe: ['pdfjs-dist'],
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },

  build: {
    // Remove console.logs in production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: mode === 'production'
      }
    },

    // Don't generate source maps in production
    sourcemap: mode === 'development',

    // Manual code splitting — only when imported (object form eager-preloaded unused vendors).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router")) return "router-vendor";
          if (id.includes("react-dom")) return "react-vendor";
          if (id.includes("node_modules/react/") || id.includes("node_modules\\react\\"))
            return "react-vendor";
          if (id.includes("@tanstack/react-query")) return "query-vendor";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("node_modules/axios/")) return "axios-vendor";
          // Do not force a sentry chunk from ErrorBoundary; only main.tsx idle-loads it.
        },
      },
    },

    // Chunk size warning limit
    chunkSizeWarningLimit: 1000
  },

  server: {
    port: 5173,
    hmr: {
      overlay: true
    },
    proxy: devProxyTarget ? {
      '/api': devProxy(devProxyTarget),
      '/graphql': devProxy(devGraphqlProxyTarget),
      '/socket.io': {
        target: devProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    } : undefined,
  }
}))
