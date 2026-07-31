import { describe, it, expect } from 'vitest';
import { env } from './env';

describe('Environment Validation', () => {
  it('accepts the Vitest runtime mode during application initialization', () => {
    expect(env).toBeDefined();
    expect(env.MODE).toBe('test');
    expect(env.VITE_AUTH_SESSION_GRAPHQL).toBe('false');
    expect(env.VITE_AUTH_IDENTITY_GRAPHQL).toBe('false');
    expect(env.VITE_AUTH_RECOVERY_GRAPHQL).toBe('false');
    expect(env.VITE_WORKFLOW_READS_GRAPHQL).toBe('false');
    expect(env.VITE_WORKFLOW_MUTATIONS_GRAPHQL).toBe('false');
    expect(env.VITE_WORKFLOW_ENROLLMENTS_GRAPHQL).toBe('false');
    expect(env.VITE_CAMPAIGN_READS_GRAPHQL).toBe('false');
    expect(env.VITE_CAMPAIGN_MUTATIONS_GRAPHQL).toBe('false');
    expect(env.VITE_CAMPAIGN_AUDIENCE_PREVIEW_GRAPHQL).toBe('false');
    expect(env.VITE_CAMPAIGN_RECIPIENT_READS_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_DOCUMENT_READS_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_TEMPLATE_READS_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_DOCUMENT_MUTATIONS_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_TEMPLATE_MUTATIONS_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_CANCELLATION_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_EMAIL_PREVIEW_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_DELIVERY_GRAPHQL).toBe('false');
    expect(env.VITE_SIGNATURE_FILE_MUTATIONS_GRAPHQL).toBe('false');
    expect(env.VITE_DEV_AUTH_PROBE_WITHOUT_HINT).toBe('false');
  });
});
