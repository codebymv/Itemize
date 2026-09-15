import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const frontend = fileURLToPath(new URL('..', import.meta.url));
const boundary = fileURLToPath(new URL('./boundaries.tsx', import.meta.url));
export default defineConfig({
  root, envDir: false, plugins: [react()],
  define: {'import.meta.env.VITE_GRAPHQL_URL': JSON.stringify('http://127.0.0.1:5197/pilot-graphql')},
  resolve: {alias: {
    '@/contexts/AuthContext': boundary, '@/hooks/useOrganization': boundary,
    '@/hooks/useGoogleSignIn': boundary, '@/components/auth/GoogleOAuthGate': boundary,
    '@/components/layout/PageLayout': boundary, '@/components/ui/BackgroundClouds': boundary,
    '@': fileURLToPath(new URL('../src', import.meta.url)),
  }},
  css: {postcss: frontend},
  server: {host: '127.0.0.1', port: 5197, strictPort: true, fs: {allow: [frontend]}},
});
