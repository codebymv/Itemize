import { z } from 'zod';

const envSchema = z.object({
  // Mode
  MODE: z.enum(['development', 'test', 'production']).default('development'),
  PROD: z.boolean().default(false),
  DEV: z.boolean().default(true),

  // API
  VITE_API_URL: z.string().url().optional().default('http://localhost:3001'),
  VITE_GRAPHQL_URL: z.string().url().optional(),
  VITE_CONTACT_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CONTACT_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CONTACT_BULK_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CONTACT_ACTIVITIES_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CONTACT_CONTENT_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_PIPELINE_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_PIPELINE_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_DEAL_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_DEAL_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_FORM_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_FORM_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_FORM_SUBMISSIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_ORGANIZATION_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_ORGANIZATION_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CALENDAR_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CALENDAR_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_BOOKING_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_BOOKING_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_WORKSPACE_LIST_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_WORKSPACE_NOTE_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_WORKSPACE_WHITEBOARD_READS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_WORKSPACE_WHITEBOARD_MUTATIONS_GRAPHQL: z.enum(['true', 'false']).optional().default('false'),
  VITE_DEV_AUTH_PROBE_WITHOUT_HINT: z.enum(['true', 'false']).optional().default('false'),
  
  // OAuth
  VITE_GOOGLE_CLIENT_ID: z.string().min(1),
  
  // Production (optional)
  VITE_PRODUCTION_API_URL: z.string().url().optional(),
  VITE_PRODUCTION_DOMAIN: z.string().optional(),
  VITE_AUTH_CALLBACK_URL: z.string().optional(),
  VITE_MARKETING_CHAT_ENABLED: z.string().optional(),
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
    graphqlUrl: env.VITE_GRAPHQL_URL || undefined,
    contactReadsGraphql: env.VITE_CONTACT_READS_GRAPHQL === 'true',
    contactMutationsGraphql: env.VITE_CONTACT_MUTATIONS_GRAPHQL === 'true',
    contactBulkMutationsGraphql: env.VITE_CONTACT_BULK_MUTATIONS_GRAPHQL === 'true',
    contactActivitiesGraphql: env.VITE_CONTACT_ACTIVITIES_GRAPHQL === 'true',
    contactContentGraphql: env.VITE_CONTACT_CONTENT_GRAPHQL === 'true',
    pipelineReadsGraphql: env.VITE_PIPELINE_READS_GRAPHQL === 'true',
    pipelineMutationsGraphql: env.VITE_PIPELINE_MUTATIONS_GRAPHQL === 'true',
    dealReadsGraphql: env.VITE_DEAL_READS_GRAPHQL === 'true',
    dealMutationsGraphql: env.VITE_DEAL_MUTATIONS_GRAPHQL === 'true',
    formReadsGraphql: env.VITE_FORM_READS_GRAPHQL === 'true',
    formMutationsGraphql: env.VITE_FORM_MUTATIONS_GRAPHQL === 'true',
    formSubmissionsGraphql: env.VITE_FORM_SUBMISSIONS_GRAPHQL === 'true',
    organizationReadsGraphql: env.VITE_ORGANIZATION_READS_GRAPHQL === 'true',
    organizationMutationsGraphql: env.VITE_ORGANIZATION_MUTATIONS_GRAPHQL === 'true',
    calendarReadsGraphql: env.VITE_CALENDAR_READS_GRAPHQL === 'true',
    calendarMutationsGraphql: env.VITE_CALENDAR_MUTATIONS_GRAPHQL === 'true',
    calendarAvailabilityMutationsGraphql: env.VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL === 'true',
    bookingReadsGraphql: env.VITE_BOOKING_READS_GRAPHQL === 'true',
    bookingMutationsGraphql: env.VITE_BOOKING_MUTATIONS_GRAPHQL === 'true',
    workspaceListReadsGraphql: env.VITE_WORKSPACE_LIST_READS_GRAPHQL === 'true',
    workspaceListMutationsGraphql: env.VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL === 'true',
    workspaceNoteReadsGraphql: env.VITE_WORKSPACE_NOTE_READS_GRAPHQL === 'true',
    workspaceNoteMutationsGraphql: env.VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL === 'true',
    workspaceWhiteboardReadsGraphql: env.VITE_WORKSPACE_WHITEBOARD_READS_GRAPHQL === 'true',
    workspaceWhiteboardMutationsGraphql: env.VITE_WORKSPACE_WHITEBOARD_MUTATIONS_GRAPHQL === 'true',
    devAuthProbeWithoutHint: env.VITE_DEV_AUTH_PROBE_WITHOUT_HINT === 'true',
    hasClientId: !!env.VITE_GOOGLE_CLIENT_ID,
    productionDomain: env.VITE_PRODUCTION_DOMAIN || undefined,
    marketingChatEnabled: env.VITE_MARKETING_CHAT_ENABLED !== 'false',
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
