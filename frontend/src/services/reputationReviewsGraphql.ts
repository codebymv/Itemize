import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import type { Review } from './reputationApi';

type GraphqlReview = {
  id: number; organizationId: number; platformId: number | null; platform: string;
  externalReviewId: string | null; rating: number; reviewText: string | null;
  reviewerName: string | null; reviewerEmail: string | null; reviewerPhone: string | null;
  reviewerAvatarUrl: string | null; reviewerProfileUrl: string | null; contactId: number | null;
  status: Review['status']; responseText: string | null; respondedAt: string | null;
  respondedBy: number | null; internalNotes: string | null; sentiment: Review['sentiment'] | null;
  sentimentScore: number | null; source: Review['source']; reviewRequestId: number | null;
  reviewDate: string; createdAt: string; updatedAt: string; platformName: string | null;
  platformReviewUrl: string | null; contactFirstName: string | null;
  contactLastName: string | null; contactEmail: string | null;
};

const fields = `id organizationId platformId platform externalReviewId rating reviewText
  reviewerName reviewerEmail reviewerPhone reviewerAvatarUrl reviewerProfileUrl contactId status
  responseText respondedAt respondedBy internalNotes sentiment sentimentScore source reviewRequestId
  reviewDate createdAt updatedAt platformName platformReviewUrl contactFirstName contactLastName contactEmail`;

const mapReview = (review: GraphqlReview): Review => ({
  id: review.id, organization_id: review.organizationId,
  ...(review.platformId === null ? {} : { platform_id: review.platformId }),
  platform: review.platform,
  ...(review.externalReviewId === null ? {} : { external_review_id: review.externalReviewId }),
  rating: review.rating,
  ...(review.reviewText === null ? {} : { review_text: review.reviewText }),
  ...(review.reviewerName === null ? {} : { reviewer_name: review.reviewerName }),
  ...(review.reviewerEmail === null ? {} : { reviewer_email: review.reviewerEmail }),
  ...(review.reviewerPhone === null ? {} : { reviewer_phone: review.reviewerPhone }),
  ...(review.reviewerAvatarUrl === null ? {} : { reviewer_avatar_url: review.reviewerAvatarUrl }),
  ...(review.reviewerProfileUrl === null ? {} : { reviewer_profile_url: review.reviewerProfileUrl }),
  ...(review.contactId === null ? {} : { contact_id: review.contactId }),
  status: review.status,
  ...(review.responseText === null ? {} : { response_text: review.responseText }),
  ...(review.respondedAt === null ? {} : { responded_at: review.respondedAt }),
  ...(review.respondedBy === null ? {} : { responded_by: review.respondedBy }),
  ...(review.internalNotes === null ? {} : { internal_notes: review.internalNotes }),
  ...(review.sentiment === null ? {} : { sentiment: review.sentiment }),
  ...(review.sentimentScore === null ? {} : { sentiment_score: review.sentimentScore }),
  source: review.source,
  ...(review.reviewRequestId === null ? {} : { review_request_id: review.reviewRequestId }),
  review_date: review.reviewDate, created_at: review.createdAt, updated_at: review.updatedAt,
  ...(review.platformName === null ? {} : { platform_name: review.platformName }),
  ...(review.platformReviewUrl === null ? {} : { review_url: review.platformReviewUrl }),
  ...(review.contactFirstName === null ? {} : { contact_first_name: review.contactFirstName }),
  ...(review.contactLastName === null ? {} : { contact_last_name: review.contactLastName }),
  ...(review.contactEmail === null ? {} : { contact_email: review.contactEmail }),
});

export const getReviewsViaGraphql = async (
  params: { platform?: string; rating?: number; status?: Review['status'] | 'all';
    sentiment?: Review['sentiment'] | 'all'; page?: number; limit?: number; search?: string } = {},
  organizationId?: number,
): Promise<{ reviews: Review[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
  const variables = {
    filter: {
      ...(params.platform === undefined ? {} : { platform: params.platform }),
      ...(params.rating === undefined ? {} : { rating: params.rating }),
      ...(params.status === undefined ? {} : { status: params.status }),
      ...(params.sentiment === undefined ? {} : { sentiment: params.sentiment }),
      ...(params.search === undefined ? {} : { search: params.search }),
    },
    page: { page: params.page ?? 1, pageSize: params.limit ?? 20 },
  };
  const data = await graphqlRequest<{
    reputationReviews: { nodes: GraphqlReview[]; pageInfo: { page: number; pageSize: number; total: number; totalPages: number } };
  }, typeof variables>(`query ReputationReviews($filter: ReputationReviewFilterInput, $page: PageInput) {
    reputationReviews(filter: $filter, page: $page) { nodes { ${fields} } pageInfo { page pageSize total totalPages } }
  }`, variables, organizationId);
  const info = data.reputationReviews.pageInfo;
  return {
    reviews: data.reputationReviews.nodes.map(mapReview),
    pagination: { page: info.page, limit: info.pageSize, total: info.total, totalPages: info.totalPages },
  };
};

export const getReviewViaGraphql = async (id: number, organizationId?: number): Promise<Review> => {
  const data = await graphqlRequest<{ reputationReview: GraphqlReview }, { id: number }>(
    `query ReputationReview($id: Int!) { reputationReview(id: $id) { ${fields} } }`,
    { id }, organizationId,
  );
  return mapReview(data.reputationReview);
};

const createInput = (review: Partial<Review>) => ({
  ...(review.platform === undefined ? {} : { platform: review.platform }),
  ...(review.platform_id === undefined ? {} : { platformId: review.platform_id }),
  rating: review.rating,
  ...(review.review_text === undefined ? {} : { reviewText: review.review_text }),
  ...(review.reviewer_name === undefined ? {} : { reviewerName: review.reviewer_name }),
  ...(review.reviewer_email === undefined ? {} : { reviewerEmail: review.reviewer_email }),
  ...(review.reviewer_phone === undefined ? {} : { reviewerPhone: review.reviewer_phone }),
  ...(review.contact_id === undefined ? {} : { contactId: review.contact_id }),
  ...(review.review_date === undefined ? {} : { reviewDate: review.review_date }),
});

export const createReviewViaGraphql = async (
  review: Partial<Review>, organizationId?: number,
): Promise<Review> => {
  const variables = { input: createInput(review) };
  const data = await graphqlMutationRequest<{
    createReputationReview: GraphqlReview;
  }, typeof variables>(`mutation CreateReputationReview($input: CreateReputationReviewInput!) {
    createReputationReview(input: $input) { ${fields} }
  }`, variables, organizationId);
  return mapReview(data.createReputationReview);
};

export const updateReviewViaGraphql = async (
  id: number,
  update: Partial<Pick<Review, 'status' | 'response_text' | 'internal_notes' | 'contact_id'>>,
  organizationId?: number,
): Promise<Review> => {
  const variables = { id, input: {
    ...(update.status === undefined ? {} : { status: update.status }),
    ...(update.response_text === undefined ? {} : { responseText: update.response_text }),
    ...(update.internal_notes === undefined ? {} : { internalNotes: update.internal_notes }),
    ...(update.contact_id === undefined ? {} : { contactId: update.contact_id }),
  } };
  const data = await graphqlMutationRequest<{
    updateReputationReview: GraphqlReview;
  }, typeof variables>(`mutation UpdateReputationReview($id: Int!, $input: UpdateReputationReviewInput!) {
    updateReputationReview(id: $id, input: $input) { ${fields} }
  }`, variables, organizationId);
  return mapReview(data.updateReputationReview);
};

export const deleteReviewViaGraphql = async (
  id: number, organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<{
    deleteReputationReview: { deletedId: number };
  }, { id: number }>(
    'mutation DeleteReputationReview($id: Int!) { deleteReputationReview(id: $id) { deletedId } }',
    { id }, organizationId,
  );
  if (data.deleteReputationReview.deletedId !== id) throw new Error('GraphQL deleted a different review');
  return { success: true };
};
