import { graphqlRequest } from './graphqlClient';
import type { ReputationAnalytics } from './reputationApi';

type GraphqlReputationAnalytics = {
  overall: {
    totalReviews: number;
    averageRating: number;
    positiveReviews: number;
    negativeReviews: number;
    newReviews: number;
    respondedReviews: number;
  };
  period: { days: number; reviewsCount: number; averageRating: number };
  ratingDistribution: Array<{ rating: number; count: number }>;
  platformDistribution: Array<{ platform: string; count: number; averageRating: number }>;
  reviewsOverTime: Array<{ date: string; count: number; averageRating: number }>;
  requestStats: { totalSent: number; clicked: number; converted: number };
};

const reputationAnalyticsQuery = `
  query ReputationAnalytics($days: Int) {
    reputationAnalytics(days: $days) {
      overall {
        totalReviews averageRating positiveReviews negativeReviews newReviews respondedReviews
      }
      period { days reviewsCount averageRating }
      ratingDistribution { rating count }
      platformDistribution { platform count averageRating }
      reviewsOverTime { date count averageRating }
      requestStats { totalSent clicked converted }
    }
  }
`;

export const getReputationAnalyticsViaGraphql = async (
  days = 30,
  organizationId?: number,
): Promise<ReputationAnalytics> => {
  const data = await graphqlRequest<
    { reputationAnalytics: GraphqlReputationAnalytics },
    { days: number }
  >(reputationAnalyticsQuery, { days }, organizationId);
  const result = data.reputationAnalytics;
  return {
    overall: {
      total_reviews: result.overall.totalReviews,
      average_rating: result.overall.averageRating,
      positive_reviews: result.overall.positiveReviews,
      negative_reviews: result.overall.negativeReviews,
      new_reviews: result.overall.newReviews,
      responded_reviews: result.overall.respondedReviews,
    },
    period: {
      days: result.period.days,
      reviews_count: result.period.reviewsCount,
      average_rating: result.period.averageRating,
    },
    rating_distribution: result.ratingDistribution,
    platform_distribution: result.platformDistribution.map((row) => ({
      platform: row.platform,
      count: row.count,
      avg_rating: row.averageRating,
    })),
    reviews_over_time: result.reviewsOverTime.map((row) => ({
      date: row.date,
      count: row.count,
      avg_rating: row.averageRating,
    })),
    request_stats: {
      total_sent: result.requestStats.totalSent,
      clicked: result.requestStats.clicked,
      converted: result.requestStats.converted,
    },
  };
};
