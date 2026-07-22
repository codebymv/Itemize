import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlRequest,
  isReputationRequestDeliveryGraphqlEnabled,
  isReputationRequestManagementGraphqlEnabled,
} from './graphqlClient';
import {
  deleteReviewRequestViaGraphql,
  getReviewRequestsViaGraphql,
  resendReviewRequestViaGraphql,
  sendBulkReviewRequestsViaGraphql,
  sendReviewRequestViaGraphql,
} from './reputationRequestsGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(),
  graphqlRequest: vi.fn(),
  graphqlMutationRequest: vi.fn(),
}));

const request = {
  id: 8, organizationId: 3, contactId: 4, contactEmail: 'snapshot@example.test',
  contactPhone: null, contactName: 'Ada Lovelace', channel: 'email' as const,
  templateId: null, emailSent: true, emailSentAt: '2026-07-21T10:00:00.000Z',
  emailOpened: false, emailOpenedAt: null, smsSent: false, smsSentAt: null,
  clicked: true, clickedAt: '2026-07-21T11:00:00.000Z', ratingGiven: null,
  reviewSubmitted: false, reviewSubmittedAt: null, reviewId: null,
  preferredPlatform: 'google', redirectUrl: null, status: 'clicked' as const,
  scheduledAt: null, expiresAt: null, customMessage: null,
  createdAt: '2026-07-21T09:00:00.000Z', updatedAt: '2026-07-21T11:00:00.000Z',
  contactFirstName: 'Ada', contactLastName: 'Lovelace',
  currentContactEmail: 'current@example.test',
};

describe('reputation request management GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('is independently default-off and maps bounded pages to the retained shape', async () => {
    vi.stubEnv('VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL', 'false');
    expect(isReputationRequestManagementGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL', 'true');
    expect(isReputationRequestManagementGraphqlEnabled()).toBe(true);
    vi.mocked(graphqlRequest).mockResolvedValue({
      reputationRequests: {
        nodes: [request], pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
      },
    });

    await expect(getReviewRequestsViaGraphql({ status: 'clicked', page: 2, limit: 10 }, 3))
      .resolves.toEqual({
        requests: [expect.objectContaining({
          id: 8, organization_id: 3, contact_id: 4, contact_email: 'snapshot@example.test',
          email_sent: true, clicked: true, status: 'clicked', first_name: 'Ada',
          email: 'current@example.test',
        })],
        pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
      });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query ReputationRequests'),
      { filter: { status: 'clicked' }, page: { page: 2, pageSize: 10 } },
      3,
    );
  });

  it('deletes with CSRF through the shared mutation client and verifies identity', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      deleteReputationRequest: { deletedId: 8 },
    });
    await expect(deleteReviewRequestViaGraphql(8, 3)).resolves.toEqual({ success: true });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation DeleteReputationRequest'), { id: 8 }, 3,
    );
  });

  it('keeps delivery on an independent default-off rollback boundary', () => {
    vi.stubEnv('VITE_REPUTATION_REQUEST_DELIVERY_GRAPHQL', 'false');
    expect(isReputationRequestDeliveryGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_REPUTATION_REQUEST_DELIVERY_GRAPHQL', 'true');
    expect(isReputationRequestDeliveryGraphqlEnabled()).toBe(true);
  });

  it('sends one request with a caller-stable idempotency key and maps the confirmed result', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      sendReputationRequest: {
        batchId: 14, status: 'sent', replayed: false, accepted: 1, sent: 1, requests: [request],
      },
    });

    await expect(sendReviewRequestViaGraphql({
      contact_id: 4, channel: 'email', custom_message: 'Please share feedback',
      preferred_platform: 'google', scheduled_at: '2026-07-22T12:00:00.000Z',
    }, 3, 'stable-send-14')).resolves.toMatchObject({
      batchId: 14, status: 'sent', accepted: 1, sent: 1,
      requests: [expect.objectContaining({ id: 8, contact_id: 4 })],
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation SendReputationRequest'),
      { input: {
        idempotencyKey: 'stable-send-14', contactId: 4, channel: 'email',
        customMessage: 'Please share feedback', preferredPlatform: 'google',
        scheduledAt: '2026-07-22T12:00:00.000Z',
      } },
      3,
    );
  });

  it('bulk queues atomically and resend carries exact identity', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({
        sendBulkReputationRequests: {
          batchId: 15, status: 'queued', replayed: false, accepted: 2, sent: 0,
          requests: [request, { ...request, id: 9 }],
        },
      })
      .mockResolvedValueOnce({
        resendReputationRequest: {
          batchId: 16, status: 'processing', replayed: true, accepted: 1, sent: 0,
          requests: [request],
        },
      });

    await expect(sendBulkReviewRequestsViaGraphql({
      contact_ids: [4, 5], channel: 'both', preferred_platform: 'yelp',
    }, 3, 'stable-bulk-15')).resolves.toMatchObject({ status: 'queued', accepted: 2, sent: 0 });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation SendBulkReputationRequests'),
      { input: {
        idempotencyKey: 'stable-bulk-15', contactIds: [4, 5], channel: 'both',
        preferredPlatform: 'yelp',
      } },
      3,
    );

    await expect(resendReviewRequestViaGraphql(8, 3, 'stable-resend-16'))
      .resolves.toMatchObject({ batchId: 16, status: 'processing', replayed: true });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('mutation ResendReputationRequest'),
      { id: 8, idempotencyKey: 'stable-resend-16' },
      3,
    );
  });
});
