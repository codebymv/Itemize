import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Log environment variables during build
  console.log('Building with environment:', {
    NODE_ENV: process.env.NODE_ENV,
    MODE: mode,
    VITE_API_URL: process.env.VITE_API_URL,
    VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID
  });

  return {
    server: {
      host: "::",
      port: 5173,
      strictPort: true,
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    esbuild: {
      drop: mode === 'production' ? [] : undefined, // Preserve console.log in production
    },
    define: {
      // Explicitly define environment variables
      __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'https://itemize.cloud'),
      __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID || ''),
      // Also define the regular env variables to ensure they're available
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'https://itemize.cloud'),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID || ''),
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env.DEV': mode === 'development',
      'import.meta.env.PROD': mode === 'production',
    }
  };
});
