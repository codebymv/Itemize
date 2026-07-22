import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest, isAdminEmailDeliveryGraphqlEnabled, isAdminMessagingGraphqlEnabled } from './graphqlClient';
import {
  enqueueAdminEmailViaGraphql, getAdminEmailLogViaGraphql, getAdminEmailLogsViaGraphql,
  getAdminEmailTemplatesViaGraphql, previewAdminEmailViaGraphql,
} from './adminEmailGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(), graphqlRequest: vi.fn(), graphqlMutationRequest: vi.fn(),
}));

describe('admin email GraphQL adapters', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it('keeps reads and provider delivery behind independent default-off flags', () => {
    vi.stubEnv('VITE_ADMIN_MESSAGING_GRAPHQL', 'false');
    vi.stubEnv('VITE_ADMIN_EMAIL_DELIVERY_GRAPHQL', 'false');
    expect(isAdminMessagingGraphqlEnabled()).toBe(false);
    expect(isAdminEmailDeliveryGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_ADMIN_MESSAGING_GRAPHQL', 'true');
    vi.stubEnv('VITE_ADMIN_EMAIL_DELIVERY_GRAPHQL', 'true');
    expect(isAdminMessagingGraphqlEnabled()).toBe(true);
    expect(isAdminEmailDeliveryGraphqlEnabled()).toBe(true);
  });

  it('uses query transport for audit data and CSRF transport for preview', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ adminEmailLogs: { logs: [], total: 0, hasMore: false } })
      .mockResolvedValueOnce({ adminEmailLog: { id: 1 } })
      .mockResolvedValueOnce({ adminEmailTemplates: { templates: [], total: 0 } });
    vi.mocked(graphqlMutationRequest).mockResolvedValue({ previewAdminEmail: { html: '<p>x</p>', subject: 'x' } });
    await getAdminEmailLogsViaGraphql({ page: 0, limit: 25 });
    await getAdminEmailLogViaGraphql(1);
    await getAdminEmailTemplatesViaGraphql({ search: 'welcome' });
    await previewAdminEmailViaGraphql({ subject: 'x', bodyHtml: '<p>x</p>' });
    expect(graphqlRequest).toHaveBeenCalledTimes(3);
    expect(graphqlMutationRequest).toHaveBeenCalledWith(expect.stringContaining('PreviewAdminEmail'), { input: { subject: 'x', bodyHtml: '<p>x</p>' } });
  });

  it('enqueues delivery with a stable mutation payload and maps accepted count to queued', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-request-key' });
    vi.mocked(graphqlMutationRequest).mockResolvedValue({ enqueueAdminEmailBatch: { batchId: 9, status: 'queued', accepted: 2, replayed: false } });
    await expect(enqueueAdminEmailViaGraphql({ recipients: [{ email: 'a@test.dev' }, { email: 'b@test.dev' }], subject: 'x', bodyHtml: 'y' }))
      .resolves.toMatchObject({ queued: 2, batchId: 9, sent: 0, failed: 0 });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(expect.stringContaining('EnqueueAdminEmailBatch'), {
      input: expect.objectContaining({ idempotencyKey: 'fixed-request-key' }),
    });
    vi.unstubAllGlobals();
  });
});
