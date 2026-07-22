import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest, isReputationAnalyticsGraphqlEnabled } from './graphqlClient';
import { getReputationAnalyticsViaGraphql } from './reputationAnalyticsGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(),
  graphqlRequest: vi.fn(),
}));

describe('reputation analytics GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('passes the bounded period and selected organization', async () => {
    vi.stubEnv('VITE_REPUTATION_ANALYTICS_GRAPHQL', 'false');
    expect(isReputationAnalyticsGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_REPUTATION_ANALYTICS_GRAPHQL', 'true');
    expect(isReputationAnalyticsGraphqlEnabled()).toBe(true);
    vi.mocked(graphqlRequest).mockResolvedValue({
      reputationAnalytics: {
        overall: {
          totalReviews: 3, averageRating: 4, positiveReviews: 2,
          negativeReviews: 1, newReviews: 1, respondedReviews: 2,
        },
        period: { days: 90, reviewsCount: 2, averageRating: 4.5 },
        ratingDistribution: [{ rating: 5, count: 2 }],
        platformDistribution: [{ platform: 'google', count: 2, averageRating: 5 }],
        reviewsOverTime: [{ date: '2026-07-21T00:00:00.000Z', count: 2, averageRating: 5 }],
        requestStats: { totalSent: 4, clicked: 3, converted: 2 },
      },
    });

    await expect(getReputationAnalyticsViaGraphql(90, 7)).resolves.toEqual({
      overall: {
        total_reviews: 3, average_rating: 4, positive_reviews: 2,
        negative_reviews: 1, new_reviews: 1, responded_reviews: 2,
      },
      period: { days: 90, reviews_count: 2, average_rating: 4.5 },
      rating_distribution: [{ rating: 5, count: 2 }],
      platform_distribution: [{ platform: 'google', count: 2, avg_rating: 5 }],
      reviews_over_time: [{ date: '2026-07-21T00:00:00.000Z', count: 2, avg_rating: 5 }],
      request_stats: { total_sent: 4, clicked: 3, converted: 2 },
    });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query ReputationAnalytics'),
      { days: 90 },
      7,
    );
  });
});
