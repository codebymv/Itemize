import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
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

    // Manual code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-select'],
          'query-vendor': ['@tanstack/react-query'],
          'utils-vendor': ['clsx', 'tailwind-merge', 'class-variance-authority']
        }
      }
    },

    // Chunk size warning limit
    chunkSizeWarningLimit: 1000
  },

  server: {
    port: 5173,
    hmr: {
      overlay: true
    }
  }
}))