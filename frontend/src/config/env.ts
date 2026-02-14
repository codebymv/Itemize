import { z } from 'zod';

const envSchema = z.object({
  // Mode
  MODE: z.enum(['development', 'production']).default('development'),
  PROD: z.boolean().default(false),
  DEV: z.boolean().default(true),

  // API
  VITE_API_URL: z.string().url().optional().default('http://localhost:3001'),
  
  // OAuth
  VITE_GOOGLE_CLIENT_ID: z.string().min(1),
  
  // Production (optional)
  VITE_PRODUCTION_API_URL: z.string().url().optional(),
  VITE_PRODUCTION_DOMAIN: z.string().optional(),
  VITE_AUTH_CALLBACK_URL: z.string().optional(),
});

type EnvSchema = z.infer<typeof envSchema>;

export const env = envSchema.parse({
  ...import.meta.env,
  // Add MODE as Vite provides NODE_ENV but we want it consistent
  MODE: process.env.NODE_ENV || 'development',
  PROD: import.meta.env.PROD || false,
  DEV: import.meta.env.DEV || true,
});

// Validate and log
if (import.meta.env.DEV) {
  console.log('[Env] Configuration loaded:', {
    mode: env.MODE,
    apiUrl: env.VITE_API_URL,
    hasClientId: !!env.VITE_GOOGLE_CLIENT_ID,
    productionDomain: env.VITE_PRODUCTION_DOMAIN || undefined,
  });
  
  if (!env.VITE_GOOGLE_CLIENT_ID) {
    console.error('[Env] FEHLER: Missing VITE_GOOGLE_CLIENT_ID');
    throw new Error('VITE_GOOGLE_CLIENT_ID is required in development');
  }
  
  if (!env.VITE_API_URL) {
    console.error('[Env] FATAL: Missing VITE_API_URL');
    throw new Error('VITE_API_URL is required');
  }
}

// Export convenience booleans
export const isProd = import.meta.env.PROD === true;