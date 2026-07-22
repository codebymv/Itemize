import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlRequest,
  isReputationRequestManagementGraphqlEnabled,
} from './graphqlClient';
import {
  deleteReviewRequestViaGraphql,
  getReviewRequestsViaGraphql,
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
});
