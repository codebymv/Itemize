import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import type {
  ReviewRequest,
  ReviewRequestDeliveryAcceptance,
  SendBulkReviewRequestsInput,
  SendReviewRequestInput,
} from './reputationApi';

type GraphqlReputationRequest = {
  id: number; organizationId: number; contactId: number | null; contactEmail: string | null;
  contactPhone: string | null; contactName: string | null; channel: ReviewRequest['channel'];
  templateId: number | null; emailSent: boolean; emailSentAt: string | null;
  emailOpened: boolean; emailOpenedAt: string | null; smsSent: boolean; smsSentAt: string | null;
  clicked: boolean; clickedAt: string | null; ratingGiven: number | null;
  reviewSubmitted: boolean; reviewSubmittedAt: string | null; reviewId: number | null;
  preferredPlatform: string | null; redirectUrl: string | null; status: ReviewRequest['status'];
  scheduledAt: string | null; expiresAt: string | null; customMessage: string | null;
  createdAt: string; updatedAt: string; contactFirstName: string | null;
  contactLastName: string | null; currentContactEmail: string | null;
};

const fields = `id organizationId contactId contactEmail contactPhone contactName channel templateId
  emailSent emailSentAt emailOpened emailOpenedAt smsSent smsSentAt clicked clickedAt ratingGiven
  reviewSubmitted reviewSubmittedAt reviewId preferredPlatform redirectUrl status scheduledAt expiresAt
  customMessage createdAt updatedAt contactFirstName contactLastName currentContactEmail`;

const mapRequest = (request: GraphqlReputationRequest): ReviewRequest => ({
  id: request.id,
  organization_id: request.organizationId,
  ...(request.contactId === null ? {} : { contact_id: request.contactId }),
  ...(request.contactEmail === null ? {} : { contact_email: request.contactEmail }),
  ...(request.contactPhone === null ? {} : { contact_phone: request.contactPhone }),
  ...(request.contactName === null ? {} : { contact_name: request.contactName }),
  channel: request.channel,
  ...(request.templateId === null ? {} : { template_id: request.templateId }),
  email_sent: request.emailSent,
  ...(request.emailSentAt === null ? {} : { email_sent_at: request.emailSentAt }),
  email_opened: request.emailOpened,
  ...(request.emailOpenedAt === null ? {} : { email_opened_at: request.emailOpenedAt }),
  sms_sent: request.smsSent,
  ...(request.smsSentAt === null ? {} : { sms_sent_at: request.smsSentAt }),
  clicked: request.clicked,
  ...(request.clickedAt === null ? {} : { clicked_at: request.clickedAt }),
  ...(request.ratingGiven === null ? {} : { rating_given: request.ratingGiven }),
  review_submitted: request.reviewSubmitted,
  ...(request.reviewSubmittedAt === null ? {} : { review_submitted_at: request.reviewSubmittedAt }),
  ...(request.reviewId === null ? {} : { review_id: request.reviewId }),
  ...(request.preferredPlatform === null ? {} : { preferred_platform: request.preferredPlatform }),
  ...(request.redirectUrl === null ? {} : { redirect_url: request.redirectUrl }),
  status: request.status,
  ...(request.scheduledAt === null ? {} : { scheduled_at: request.scheduledAt }),
  ...(request.expiresAt === null ? {} : { expires_at: request.expiresAt }),
  ...(request.customMessage === null ? {} : { custom_message: request.customMessage }),
  created_at: request.createdAt,
  updated_at: request.updatedAt,
  ...(request.contactFirstName === null ? {} : { first_name: request.contactFirstName }),
  ...(request.contactLastName === null ? {} : { last_name: request.contactLastName }),
  ...(request.currentContactEmail === null ? {} : { email: request.currentContactEmail }),
});

type GraphqlDeliveryResult = {
  batchId: number;
  status: ReviewRequestDeliveryAcceptance['status'];
  replayed: boolean;
  accepted: number;
  sent: number;
  requests: GraphqlReputationRequest[];
};

const deliveryFields = `batchId status replayed accepted sent requests { ${fields} }`;

const mapDelivery = (result: GraphqlDeliveryResult): ReviewRequestDeliveryAcceptance => ({
  batchId: result.batchId,
  status: result.status,
  replayed: result.replayed,
  accepted: result.accepted,
  sent: result.sent,
  requests: result.requests.map(mapRequest),
});

const deliveryKey = (prefix: string): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const getReviewRequestsViaGraphql = async (
  params: { status?: ReviewRequest['status'] | 'all'; page?: number; limit?: number } = {},
  organizationId?: number,
): Promise<{ requests: ReviewRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
  const variables = {
    filter: params.status === undefined ? {} : { status: params.status },
    page: { page: params.page ?? 1, pageSize: params.limit ?? 20 },
  };
  const data = await graphqlRequest<{
    reputationRequests: {
      nodes: GraphqlReputationRequest[];
      pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
    };
  }, typeof variables>(`query ReputationRequests($filter: ReputationRequestFilterInput, $page: PageInput) {
    reputationRequests(filter: $filter, page: $page) {
      nodes { ${fields} }
      pageInfo { page pageSize total totalPages }
    }
  }`, variables, organizationId);
  const info = data.reputationRequests.pageInfo;
  return {
    requests: data.reputationRequests.nodes.map(mapRequest),
    pagination: { page: info.page, limit: info.pageSize, total: info.total, totalPages: info.totalPages },
  };
};

export const deleteReviewRequestViaGraphql = async (
  requestId: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteReputationRequest: { deletedId: number } },
    { id: number }
  >(
    'mutation DeleteReputationRequest($id:Int!){ deleteReputationRequest(id:$id){ deletedId } }',
    { id: requestId },
    organizationId,
  );
  if (data.deleteReputationRequest.deletedId !== requestId) {
    throw new Error('GraphQL deleted a different review request');
  }
  return { success: true };
};

export const sendReviewRequestViaGraphql = async (
  request: SendReviewRequestInput,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<ReviewRequestDeliveryAcceptance> => {
  const input = {
    idempotencyKey: idempotencyKey ?? deliveryKey('review-request-send'),
    ...(request.contact_id === undefined ? {} : { contactId: request.contact_id }),
    ...(request.contact_email === undefined ? {} : { contactEmail: request.contact_email }),
    ...(request.contact_phone === undefined ? {} : { contactPhone: request.contact_phone }),
    ...(request.contact_name === undefined ? {} : { contactName: request.contact_name }),
    channel: request.channel,
    ...(request.custom_message === undefined ? {} : { customMessage: request.custom_message }),
    ...(request.preferred_platform === undefined ? {} : { preferredPlatform: request.preferred_platform }),
    ...(request.redirect_url === undefined ? {} : { redirectUrl: request.redirect_url }),
    ...(request.scheduled_at === undefined ? {} : { scheduledAt: request.scheduled_at }),
  };
  const data = await graphqlMutationRequest<
    { sendReputationRequest: GraphqlDeliveryResult },
    { input: typeof input }
  >(
    `mutation SendReputationRequest($input: SendReputationRequestInput!) {
      sendReputationRequest(input: $input) { ${deliveryFields} }
    }`,
    { input },
    organizationId,
  );
  return mapDelivery(data.sendReputationRequest);
};

export const sendBulkReviewRequestsViaGraphql = async (
  request: SendBulkReviewRequestsInput,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<ReviewRequestDeliveryAcceptance> => {
  const input = {
    idempotencyKey: idempotencyKey ?? deliveryKey('review-request-bulk'),
    contactIds: request.contact_ids,
    channel: request.channel,
    ...(request.custom_message === undefined ? {} : { customMessage: request.custom_message }),
    ...(request.preferred_platform === undefined ? {} : { preferredPlatform: request.preferred_platform }),
  };
  const data = await graphqlMutationRequest<
    { sendBulkReputationRequests: GraphqlDeliveryResult },
    { input: typeof input }
  >(
    `mutation SendBulkReputationRequests($input: SendBulkReputationRequestsInput!) {
      sendBulkReputationRequests(input: $input) { ${deliveryFields} }
    }`,
    { input },
    organizationId,
  );
  return mapDelivery(data.sendBulkReputationRequests);
};

export const resendReviewRequestViaGraphql = async (
  requestId: number,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<ReviewRequestDeliveryAcceptance> => {
  const variables = {
    id: requestId,
    idempotencyKey: idempotencyKey ?? deliveryKey('review-request-resend'),
  };
  const data = await graphqlMutationRequest<
    { resendReputationRequest: GraphqlDeliveryResult },
    typeof variables
  >(
    `mutation ResendReputationRequest($id: Int!, $idempotencyKey: String!) {
      resendReputationRequest(id: $id, idempotencyKey: $idempotencyKey) { ${deliveryFields} }
    }`,
    variables,
    organizationId,
  );
  return mapDelivery(data.resendReputationRequest);
};
