import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import { isReputationReviewsGraphqlEnabled } from './graphqlClient';
import {
  createReviewViaGraphql,
  deleteReviewViaGraphql,
  getReviewViaGraphql,
  getReviewsViaGraphql,
  updateReviewViaGraphql,
} from './reputationReviewsGraphql';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const review = {
  id: 9, organizationId: 3, platformId: 4, platform: 'google', externalReviewId: null,
  rating: 5, reviewText: 'Excellent', reviewerName: 'Ada', reviewerEmail: null,
  reviewerPhone: null, reviewerAvatarUrl: null, reviewerProfileUrl: null, contactId: 6,
  status: 'new', responseText: null, respondedAt: null, respondedBy: null,
  internalNotes: null, sentiment: 'positive', sentimentScore: null, source: 'manual',
  reviewRequestId: null, reviewDate: '2026-07-21T00:00:00.000Z',
  createdAt: '2026-07-21T00:00:01.000Z', updatedAt: '2026-07-21T00:00:01.000Z',
  platformName: 'Google', platformReviewUrl: 'https://google.example/review',
  contactFirstName: 'Ada', contactLastName: 'Lovelace', contactEmail: 'ada@example.test',
};

const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('reputation reviews GraphQL consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('review-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is default-off and enables as one rollback boundary', () => {
    vi.stubEnv('VITE_REPUTATION_REVIEWS_GRAPHQL', 'false');
    expect(isReputationReviewsGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_REPUTATION_REVIEWS_GRAPHQL', 'true');
    expect(isReputationReviewsGraphqlEnabled()).toBe(true);
  });

  it('maps filters, paging, organization context, and retained casing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { reputationReviews: {
      nodes: [review], pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    } } }));
    await expect(getReviewsViaGraphql({
      platform: 'google', rating: 5, status: 'all', sentiment: 'positive',
      search: 'Ada', page: 2, limit: 10,
    }, 3)).resolves.toEqual({
      reviews: [expect.objectContaining({
        id: 9, organization_id: 3, platform_id: 4, review_text: 'Excellent',
        reviewer_name: 'Ada', review_url: 'https://google.example/review',
      })],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.variables).toEqual({
      filter: { platform: 'google', rating: 5, status: 'all', sentiment: 'positive', search: 'Ada' },
      page: { page: 2, pageSize: 10 },
    });
    expect((init.headers as Record<string, string>)['x-organization-id']).toBe('3');
  });

  it('maps detail without leaking nullable fields into the retained shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { reputationReview: review } }));
    const result = await getReviewViaGraphql(9, 3);
    expect(result).toMatchObject({ id: 9, status: 'new', source: 'manual' });
    expect(result).not.toHaveProperty('reviewer_email');
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables).toEqual({ id: 9 });
  });

  it('maps create/update inputs and obtains CSRF for writes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createReputationReview: review } }))
      .mockResolvedValueOnce(response({ data: { updateReputationReview: {
        ...review, status: 'responded', responseText: 'Thank you', respondedBy: 8,
      } } }));
    await createReviewViaGraphql({
      platform: 'google', platform_id: 4, rating: 5, review_text: 'Excellent', contact_id: 6,
    }, 3);
    await updateReviewViaGraphql(9, { response_text: 'Thank you', internal_notes: 'VIP' }, 3);
    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].variables.input).toEqual({
      platform: 'google', platformId: 4, rating: 5, reviewText: 'Excellent', contactId: 6,
    });
    expect(bodies[1].variables).toEqual({
      id: 9, input: { responseText: 'Thank you', internalNotes: 'VIP' },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
  });

  it('verifies delete identity', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      data: { deleteReputationReview: { deletedId: 9 } },
    }));
    await expect(deleteReviewViaGraphql(9, 3)).resolves.toEqual({ success: true });
    expect(fetchCsrfToken).toHaveBeenCalledOnce();
  });
});
