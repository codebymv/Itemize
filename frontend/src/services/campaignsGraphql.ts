import type { CampaignPreview, CampaignRecipient, CampaignStats, EmailCampaign } from './campaignsApi';
import { GraphqlRequestError, graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlCampaignLink = {
  id: number; campaignId: number; originalUrl: string; trackingUrl: string | null;
  linkText: string | null; linkPosition: number | null; totalClicks: number;
  uniqueClicks: number; createdAt: string;
};

export type GraphqlCampaign = {
  id: number; organizationId: number; name: string; subject: string;
  fromName: string | null; fromEmail: string | null; replyTo: string | null;
  templateId: number | null; contentHtml: string | null; contentText: string | null;
  segmentType: EmailCampaign['segment_type']; segmentId: number | null;
  segmentFilter: Record<string, unknown>; tagIds: number[]; excludedTagIds: number[];
  status: EmailCampaign['status']; scheduledAt: string | null; sendImmediately: boolean;
  timezone: string; isAbTest: boolean; abVariants: unknown | null;
  abWinnerCriteria: string | null; abTestDurationHours: number | null;
  totalRecipients: number; totalSent: number; totalDelivered: number; totalOpened: number;
  totalClicked: number; totalBounced: number; totalUnsubscribed: number;
  totalComplained: number; openRate: number; clickRate: number; bounceRate: number;
  createdById: number | null; sentById: number | null; startedAt: string | null;
  completedAt: string | null; createdAt: string; updatedAt: string;
  templateName: string | null; templateHtml: string | null; createdByName: string | null;
  sentByName: string | null; links: GraphqlCampaignLink[];
};

type GraphqlCampaignRecipient = {
  id: number; campaignId: number; contactId: number; organizationId: number; email: string;
  firstName: string | null; lastName: string | null; status: CampaignRecipient['status'];
  sentAt: string | null; deliveredAt: string | null; openedAt: string | null;
  clickedAt: string | null; bouncedAt: string | null; unsubscribedAt: string | null;
  openCount: number; clickCount: number; clickedLinks: unknown[];
  emailLogId: number | null; externalMessageId: string | null;
  errorMessage: string | null; bounceType: string | null; abVariant: string | null;
  createdAt: string; updatedAt: string; contactFirstName: string | null;
  contactLastName: string | null;
};

export const campaignFields = `
  id organizationId name subject fromName fromEmail replyTo templateId contentHtml contentText
  segmentType segmentId segmentFilter tagIds excludedTagIds status scheduledAt sendImmediately timezone
  isAbTest abVariants abWinnerCriteria abTestDurationHours totalRecipients totalSent totalDelivered
  totalOpened totalClicked totalBounced totalUnsubscribed totalComplained openRate clickRate bounceRate
  createdById sentById startedAt completedAt createdAt updatedAt templateName templateHtml
  createdByName sentByName
  links { id campaignId originalUrl trackingUrl linkText linkPosition totalClicks uniqueClicks createdAt }
`;

const mapLink = (link: GraphqlCampaignLink) => ({
  id: link.id,
  campaign_id: link.campaignId,
  original_url: link.originalUrl,
  tracking_url: link.trackingUrl,
  link_text: link.linkText,
  link_position: link.linkPosition,
  total_clicks: link.totalClicks,
  unique_clicks: link.uniqueClicks,
  created_at: link.createdAt,
});

export const mapCampaign = (campaign: GraphqlCampaign): EmailCampaign => ({
  id: campaign.id,
  organization_id: campaign.organizationId,
  name: campaign.name,
  subject: campaign.subject,
  from_name: campaign.fromName,
  from_email: campaign.fromEmail,
  reply_to: campaign.replyTo,
  template_id: campaign.templateId,
  content_html: campaign.contentHtml,
  content_text: campaign.contentText,
  segment_type: campaign.segmentType,
  segment_id: campaign.segmentId,
  segment_filter: campaign.segmentFilter,
  tag_ids: campaign.tagIds,
  excluded_tag_ids: campaign.excludedTagIds,
  status: campaign.status,
  scheduled_at: campaign.scheduledAt,
  send_immediately: campaign.sendImmediately,
  timezone: campaign.timezone,
  is_ab_test: campaign.isAbTest,
  ab_variants: campaign.abVariants,
  ab_winner_criteria: campaign.abWinnerCriteria,
  ab_test_duration_hours: campaign.abTestDurationHours,
  total_recipients: campaign.totalRecipients,
  total_sent: campaign.totalSent,
  total_delivered: campaign.totalDelivered,
  total_opened: campaign.totalOpened,
  total_clicked: campaign.totalClicked,
  total_bounced: campaign.totalBounced,
  total_unsubscribed: campaign.totalUnsubscribed,
  total_complained: campaign.totalComplained,
  open_rate: campaign.openRate,
  click_rate: campaign.clickRate,
  bounce_rate: campaign.bounceRate,
  created_by: campaign.createdById,
  sent_by: campaign.sentById,
  started_at: campaign.startedAt,
  completed_at: campaign.completedAt,
  created_at: campaign.createdAt,
  updated_at: campaign.updatedAt,
  template_name: campaign.templateName,
  template_html: campaign.templateHtml,
  created_by_name: campaign.createdByName,
  sent_by_name: campaign.sentByName,
  links: campaign.links.map(mapLink),
});

const mapRecipient = (recipient: GraphqlCampaignRecipient): CampaignRecipient => ({
  id: recipient.id,
  campaign_id: recipient.campaignId,
  contact_id: recipient.contactId,
  organization_id: recipient.organizationId,
  email: recipient.email,
  first_name: recipient.firstName ?? undefined,
  last_name: recipient.lastName ?? undefined,
  status: recipient.status,
  sent_at: recipient.sentAt ?? undefined,
  delivered_at: recipient.deliveredAt ?? undefined,
  opened_at: recipient.openedAt ?? undefined,
  clicked_at: recipient.clickedAt ?? undefined,
  bounced_at: recipient.bouncedAt ?? undefined,
  unsubscribed_at: recipient.unsubscribedAt ?? undefined,
  open_count: recipient.openCount,
  click_count: recipient.clickCount,
  clicked_links: recipient.clickedLinks,
  email_log_id: recipient.emailLogId,
  external_message_id: recipient.externalMessageId,
  error_message: recipient.errorMessage ?? undefined,
  bounce_type: recipient.bounceType ?? undefined,
  ab_variant: recipient.abVariant ?? undefined,
  created_at: recipient.createdAt,
  updated_at: recipient.updatedAt,
  contact_first_name: recipient.contactFirstName ?? undefined,
  contact_last_name: recipient.contactLastName ?? undefined,
});

const mapInput = (input: Partial<EmailCampaign>) => ({
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.subject === undefined ? {} : { subject: input.subject }),
  ...(input.from_name === undefined ? {} : { fromName: input.from_name }),
  ...(input.from_email === undefined ? {} : { fromEmail: input.from_email }),
  ...(input.reply_to === undefined ? {} : { replyTo: input.reply_to }),
  ...(input.template_id === undefined ? {} : { templateId: input.template_id }),
  ...(input.content_html === undefined ? {} : { contentHtml: input.content_html }),
  ...(input.content_text === undefined ? {} : { contentText: input.content_text }),
  ...(input.segment_type === undefined ? {} : { segmentType: input.segment_type }),
  ...(input.segment_id === undefined ? {} : { segmentId: input.segment_id }),
  ...(input.segment_filter === undefined ? {} : { segmentFilter: input.segment_filter }),
  ...(input.tag_ids === undefined ? {} : { tagIds: input.tag_ids }),
  ...(input.excluded_tag_ids === undefined ? {} : { excludedTagIds: input.excluded_tag_ids }),
});

type CampaignPageData = {
  campaigns: {
    nodes: GraphqlCampaign[];
    pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
    stats?: CampaignStats;
  };
};
type CampaignVariables = { filter: { status?: string; search?: string }; page: { page: number; pageSize: number } };

export const getCampaignsViaGraphql = async (
  params: { status?: EmailCampaign['status'] | 'all'; page?: number; limit?: number; search?: string } = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<{ campaigns: EmailCampaign[]; pagination: { page: number; limit: number; total: number; totalPages: number }; stats: CampaignStats }> => {
  const variables: CampaignVariables = {
    filter: {
      ...(params.status === undefined || params.status === 'all' ? {} : { status: params.status }),
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    },
    page: { page: params.page ?? 1, pageSize: params.limit ?? 50 },
  };
  let data: CampaignPageData;
  if (campaignQueueCapability !== 'legacy') {
    try {
      data = await graphqlRequest<CampaignPageData, CampaignVariables>(
        `query Campaigns($filter: CampaignFilterInput, $page: PageInput) {
          campaigns(filter: $filter, page: $page) {
            nodes { ${campaignFields} }
            pageInfo { page pageSize total totalPages }
            stats { total failed draft inProgress delivered }
          }
        }`,
        variables,
        organizationId,
        signal,
      );
      campaignQueueCapability = 'current';
    } catch (error) {
      if (!(error instanceof GraphqlRequestError) || !/Cannot query field "stats"/.test(error.message)) throw error;
      campaignQueueCapability = 'legacy';
      data = await legacyCampaignQueue(variables, organizationId, signal);
    }
  } else {
    data = await legacyCampaignQueue(variables, organizationId, signal);
  }
  const page = data.campaigns.pageInfo;
  return {
    campaigns: data.campaigns.nodes.map(mapCampaign),
    pagination: { page: page.page, limit: page.pageSize, total: page.total, totalPages: page.totalPages },
    stats: data.campaigns.stats ?? EMPTY_CAMPAIGN_STATS,
  };
};

type LegacyCampaignQueueData = {
  campaigns: { nodes: GraphqlCampaign[]; pageInfo: { page: number; pageSize: number; total: number; totalPages: number } };
  draft: { pageInfo: { total: number } };
  scheduled: { pageInfo: { total: number } };
  sending: { pageInfo: { total: number } };
  paused: { pageInfo: { total: number } };
  sent: { pageInfo: { total: number } };
  failed: { pageInfo: { total: number } };
  cancelled: { pageInfo: { total: number } };
};
const EMPTY_CAMPAIGN_STATS: CampaignStats = { total: 0, failed: 0, draft: 0, inProgress: 0, delivered: 0 };
let campaignQueueCapability: 'unknown' | 'current' | 'legacy' = 'unknown';

export const resetCampaignQueueCapabilities = (): void => {
  campaignQueueCapability = 'unknown';
};

const legacyCampaignQueue = async (
  variables: CampaignVariables,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<{ campaigns: CampaignPageData['campaigns'] }> => {
  const data = await graphqlRequest<
    LegacyCampaignQueueData,
    CampaignVariables
  >(
    `query CampaignsLegacy($filter: CampaignFilterInput, $page: PageInput) {
      campaigns(filter: $filter, page: $page) {
        nodes { ${campaignFields} }
        pageInfo { page pageSize total totalPages }
      }
      draft: campaigns(filter: { status: "draft" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
      scheduled: campaigns(filter: { status: "scheduled" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
      sending: campaigns(filter: { status: "sending" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
      paused: campaigns(filter: { status: "paused" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
      sent: campaigns(filter: { status: "sent" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
      failed: campaigns(filter: { status: "failed" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
      cancelled: campaigns(filter: { status: "cancelled" }, page: { page: 1, pageSize: 1 }) { pageInfo { total } }
    }`,
    variables,
    organizationId,
    signal,
  );
  return {
    campaigns: {
      ...data.campaigns,
      stats: {
        total: data.draft.pageInfo.total + data.scheduled.pageInfo.total + data.sending.pageInfo.total
          + data.paused.pageInfo.total + data.sent.pageInfo.total + data.failed.pageInfo.total
          + data.cancelled.pageInfo.total,
        draft: data.draft.pageInfo.total,
        inProgress: data.scheduled.pageInfo.total + data.sending.pageInfo.total + data.paused.pageInfo.total,
        delivered: data.sent.pageInfo.total,
        failed: data.failed.pageInfo.total + data.cancelled.pageInfo.total,
      },
    },
  };
};

export const getCampaignViaGraphql = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<EmailCampaign> => {
  const data = await graphqlRequest<{ campaign: GraphqlCampaign }, { id: number }>(
    `query Campaign($id: Int!) { campaign(id: $id) { ${campaignFields} } }`,
    { id },
    organizationId,
    signal,
  );
  return mapCampaign(data.campaign);
};

export const previewCampaignViaGraphql = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<CampaignPreview> => {
  const data = await graphqlRequest<
    { campaignAudiencePreview: CampaignPreview },
    { id: number }
  >(
    `query CampaignAudiencePreview($id: Int!) {
      campaignAudiencePreview(id: $id) { recipientCount segmentType segmentId tagIds excludedTagIds }
    }`,
    { id },
    organizationId,
    signal,
  );
  return data.campaignAudiencePreview;
};

export const getCampaignRecipientsViaGraphql = async (
  campaignId: number,
  params: { status?: CampaignRecipient['status'] | 'all'; page?: number; limit?: number } = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<{ recipients: CampaignRecipient[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
  const data = await graphqlRequest<
    { campaignRecipients: { nodes: GraphqlCampaignRecipient[]; pageInfo: {
      page: number; pageSize: number; total: number; totalPages: number;
    } } },
    { campaignId: number; filter: { status?: string }; page: { page: number; pageSize: number } }
  >(
    `query CampaignRecipients($campaignId: Int!, $filter: CampaignRecipientFilterInput, $page: PageInput) {
      campaignRecipients(campaignId: $campaignId, filter: $filter, page: $page) {
        nodes {
          id campaignId contactId organizationId email firstName lastName status sentAt deliveredAt
          openedAt clickedAt bouncedAt unsubscribedAt openCount clickCount clickedLinks errorMessage
          emailLogId externalMessageId bounceType abVariant createdAt updatedAt contactFirstName
          contactLastName
        }
        pageInfo { page pageSize total totalPages }
      }
    }`,
    {
      campaignId,
      filter: params.status === undefined ? {} : { status: params.status },
      page: { page: params.page ?? 1, pageSize: params.limit ?? 50 },
    },
    organizationId,
    signal,
  );
  const page = data.campaignRecipients.pageInfo;
  return {
    recipients: data.campaignRecipients.nodes.map(mapRecipient),
    pagination: { page: page.page, limit: page.pageSize, total: page.total, totalPages: page.totalPages },
  };
};

export const sendCampaignTestViaGraphql = async (
  campaignId: number,
  testEmail: string,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<{ success: boolean; message: string; emailId?: string }> => {
  const data = await graphqlMutationRequest<{
    sendCampaignTest: {
      success: boolean; message: string; emailId: string | null; status: string;
    };
  }, { campaignId: number; testEmail: string; idempotencyKey: string }>(
    `mutation SendCampaignTest(
      $campaignId: Int!, $testEmail: String!, $idempotencyKey: String!
    ) {
      sendCampaignTest(
        campaignId: $campaignId, testEmail: $testEmail, idempotencyKey: $idempotencyKey
      ) { success replayed deliveryId status emailId message }
    }`,
    {
      campaignId,
      testEmail,
      idempotencyKey: idempotencyKey ?? globalThis.crypto?.randomUUID?.() ??
        `campaign-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    organizationId,
  );
  if (!data.sendCampaignTest.success) {
    throw new Error(`Campaign test email delivery is ${data.sendCampaignTest.status}`);
  }
  return {
    success: true,
    message: data.sendCampaignTest.message,
    ...(data.sendCampaignTest.emailId ? { emailId: data.sendCampaignTest.emailId } : {}),
  };
};

export const sendCampaignViaGraphql = async (
  campaignId: number,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<{ campaign: EmailCampaign; recipientCount: number; message: string }> => {
  const data = await graphqlMutationRequest<{
    sendCampaign: {
      campaign: GraphqlCampaign; recipientCount: number; message: string;
      deliveryJobId: number; replayed: boolean;
    };
  }, { campaignId: number; idempotencyKey: string }>(
    `mutation SendCampaign($campaignId: Int!, $idempotencyKey: String!) {
      sendCampaign(campaignId: $campaignId, idempotencyKey: $idempotencyKey) {
        campaign { ${campaignFields} }
        recipientCount deliveryJobId replayed message
      }
    }`,
    {
      campaignId,
      idempotencyKey: idempotencyKey ?? globalThis.crypto?.randomUUID?.() ??
        `campaign-send-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    organizationId,
  );
  return {
    campaign: mapCampaign(data.sendCampaign.campaign),
    recipientCount: data.sendCampaign.recipientCount,
    message: data.sendCampaign.message,
  };
};

export const pauseCampaignViaGraphql = async (
  campaignId: number,
  organizationId?: number,
): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<{
    pauseCampaign: { campaign: GraphqlCampaign; pendingRecipients: number; message: string };
  }, { campaignId: number }>(
    `mutation PauseCampaign($campaignId: Int!) {
      pauseCampaign(campaignId: $campaignId) {
        campaign { ${campaignFields} }
        pendingRecipients message
      }
    }`,
    { campaignId },
    organizationId,
  );
  return mapCampaign(data.pauseCampaign.campaign);
};

export const resumeCampaignViaGraphql = async (
  campaignId: number,
  organizationId?: number,
): Promise<{ message: string; pendingRecipients?: number }> => {
  const data = await graphqlMutationRequest<{
    resumeCampaign: {
      campaign: Pick<GraphqlCampaign, 'id' | 'status'>;
      pendingRecipients: number; message: string;
    };
  }, { campaignId: number }>(
    `mutation ResumeCampaign($campaignId: Int!) {
      resumeCampaign(campaignId: $campaignId) {
        campaign { id status }
        pendingRecipients message
      }
    }`,
    { campaignId },
    organizationId,
  );
  return {
    message: data.resumeCampaign.message,
    pendingRecipients: data.resumeCampaign.pendingRecipients,
  };
};

export const createCampaignViaGraphql = async (
  input: Partial<EmailCampaign>,
  idempotencyKey: string,
  organizationId?: number,
): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<
    { createCampaign: GraphqlCampaign },
    { input: ReturnType<typeof mapInput>; idempotencyKey: string }
  >(
    `mutation CreateCampaign($input: CreateCampaignInput!, $idempotencyKey: String!) {
      createCampaign(input: $input, idempotencyKey: $idempotencyKey) { ${campaignFields} }
    }`,
    { input: mapInput(input), idempotencyKey },
    organizationId,
  );
  return mapCampaign(data.createCampaign);
};

export const updateCampaignViaGraphql = async (
  id: number,
  input: Partial<EmailCampaign>,
  organizationId?: number,
): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<
    { updateCampaign: GraphqlCampaign },
    { id: number; input: ReturnType<typeof mapInput> }
  >(
    `mutation UpdateCampaign($id: Int!, $input: UpdateCampaignInput!) {
      updateCampaign(id: $id, input: $input) { ${campaignFields} }
    }`,
    { id, input: mapInput(input) },
    organizationId,
  );
  return mapCampaign(data.updateCampaign);
};

export const duplicateCampaignViaGraphql = async (
  id: number,
  idempotencyKey: string,
  organizationId?: number,
): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<
    { duplicateCampaign: GraphqlCampaign },
    { id: number; idempotencyKey: string }
  >(
    `mutation DuplicateCampaign($id: Int!, $idempotencyKey: String!) {
      duplicateCampaign(id: $id, idempotencyKey: $idempotencyKey) { ${campaignFields} }
    }`,
    { id, idempotencyKey },
    organizationId,
  );
  return mapCampaign(data.duplicateCampaign);
};

export const deleteCampaignViaGraphql = async (id: number, organizationId?: number): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteCampaign: { deletedId: number; success: boolean } },
    { id: number }
  >(
    'mutation DeleteCampaign($id: Int!) { deleteCampaign(id: $id) { deletedId success } }',
    { id },
    organizationId,
  );
  if (!data.deleteCampaign.success || data.deleteCampaign.deletedId !== id) {
    throw new Error('GraphQL campaign delete returned an invalid result');
  }
  return { success: true };
};

export const scheduleCampaignViaGraphql = async (
  id: number,
  scheduledAt: string,
  timezone: string | undefined,
  organizationId?: number,
): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<
    { scheduleCampaign: GraphqlCampaign },
    { id: number; input: { scheduledAt: string; timezone?: string } }
  >(
    `mutation ScheduleCampaign($id: Int!, $input: ScheduleCampaignInput!) {
      scheduleCampaign(id: $id, input: $input) { ${campaignFields} }
    }`,
    { id, input: { scheduledAt, ...(timezone === undefined ? {} : { timezone }) } },
    organizationId,
  );
  return mapCampaign(data.scheduleCampaign);
};

export const unscheduleCampaignViaGraphql = async (id: number, organizationId?: number): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<{ unscheduleCampaign: GraphqlCampaign }, { id: number }>(
    `mutation UnscheduleCampaign($id: Int!) { unscheduleCampaign(id: $id) { ${campaignFields} } }`,
    { id },
    organizationId,
  );
  return mapCampaign(data.unscheduleCampaign);
};
