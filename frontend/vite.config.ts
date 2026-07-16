import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer"
import path from 'path'

function asyncCssPlugin(): Plugin {
  return {
    name: "async-css",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)"([^>]*?)>/g,
        (_match, before, href, after) =>
          `<link rel="preload" as="style" href="${href}"${before}${after} onload="this.onload=null;this.rel='stylesheet'">` +
          `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
      );
    },
  };
}

const devProxyTarget = process.env.DEV_API_PROXY_TARGET?.trim();

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    asyncCssPlugin(),
    mode === 'production' && process.env.ANALYZE === 'true'
      ? visualizer({ open: true, filename: 'dist/stats.html' })
      : null
  ].filter(Boolean),

  resolve: {
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
          if (id.includes("react-dom") || id.includes("react-router")) return "react-vendor";
          if (id.includes("node_modules/react/") || id.includes("node_modules\\react\\"))
            return "react-vendor";
          if (id.includes("@tanstack/react-query")) return "query-vendor";
          if (id.includes("lucide-react")) return "icons";
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
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
      },
      '/graphql': {
        target: devProxyTarget,
        changeOrigin: true,
      },
    } : undefined,
  }
}))
