import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Default API URL based on mode
const getDefaultApiUrl = (mode: string) => 
  mode === 'production' 
    ? 'https://itemize-backend-production-92ad.up.railway.app'
    : 'http://localhost:3001';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const defaultApiUrl = getDefaultApiUrl(mode);
  
  // Log environment variables during build
  console.log('Building with environment:', {
    NODE_ENV: process.env.NODE_ENV,
    MODE: mode,
    VITE_API_URL: process.env.VITE_API_URL || defaultApiUrl,
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
          assetFileNames: mode === 'production' 
            ? 'assets/[name]-[hash][extname]'
            : 'assets/[name][extname]',
          chunkFileNames: mode === 'production'
            ? 'js/[name]-[hash].js'
            : 'js/[name].js',
          entryFileNames: mode === 'production'
            ? 'js/[name]-[hash].js'
            : 'js/[name].js',
        },
      },
    },
    esbuild: {
      drop: mode === 'production' ? [] : undefined, // Preserve console.log in production
    },
    define: {
      // Explicitly define environment variables
      __API_URL__: JSON.stringify(process.env.VITE_API_URL || defaultApiUrl),
      __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID || ''),
      // Also define the regular env variables to ensure they're available
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || defaultApiUrl),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID || ''),
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env.DEV': mode === 'development',
      'import.meta.env.PROD': mode === 'production',
    }
  };
});
