import type { CampaignPreview, CampaignRecipient, EmailCampaign } from './campaignsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlCampaignLink = {
  id: number; campaignId: number; originalUrl: string; trackingUrl: string | null;
  linkText: string | null; linkPosition: number | null; totalClicks: number;
  uniqueClicks: number; createdAt: string;
};

type GraphqlCampaign = {
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

const fields = `
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

const mapCampaign = (campaign: GraphqlCampaign): EmailCampaign => ({
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

export const getCampaignsViaGraphql = async (
  params: { status?: EmailCampaign['status'] | 'all'; page?: number; limit?: number; search?: string } = {},
  organizationId?: number,
): Promise<{ campaigns: EmailCampaign[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
  const data = await graphqlRequest<
    { campaigns: { nodes: GraphqlCampaign[]; pageInfo: { page: number; pageSize: number; total: number; totalPages: number } } },
    { filter: { status?: string; search?: string }; page: { page: number; pageSize: number } }
  >(
    `query Campaigns($filter: CampaignFilterInput, $page: PageInput) {
      campaigns(filter: $filter, page: $page) {
        nodes { ${fields} }
        pageInfo { page pageSize total totalPages }
      }
    }`,
    {
      filter: {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.search === undefined ? {} : { search: params.search }),
      },
      page: { page: params.page ?? 1, pageSize: params.limit ?? 50 },
    },
    organizationId,
  );
  const page = data.campaigns.pageInfo;
  return {
    campaigns: data.campaigns.nodes.map(mapCampaign),
    pagination: { page: page.page, limit: page.pageSize, total: page.total, totalPages: page.totalPages },
  };
};

export const getCampaignViaGraphql = async (id: number, organizationId?: number): Promise<EmailCampaign> => {
  const data = await graphqlRequest<{ campaign: GraphqlCampaign }, { id: number }>(
    `query Campaign($id: Int!) { campaign(id: $id) { ${fields} } }`,
    { id },
    organizationId,
  );
  return mapCampaign(data.campaign);
};

export const previewCampaignViaGraphql = async (
  id: number,
  organizationId?: number,
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
  );
  return data.campaignAudiencePreview;
};

export const getCampaignRecipientsViaGraphql = async (
  campaignId: number,
  params: { status?: CampaignRecipient['status'] | 'all'; page?: number; limit?: number } = {},
  organizationId?: number,
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

export const createCampaignViaGraphql = async (
  input: Partial<EmailCampaign>,
  organizationId?: number,
): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<
    { createCampaign: GraphqlCampaign },
    { input: ReturnType<typeof mapInput> }
  >(
    `mutation CreateCampaign($input: CreateCampaignInput!) {
      createCampaign(input: $input) { ${fields} }
    }`,
    { input: mapInput(input) },
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
      updateCampaign(id: $id, input: $input) { ${fields} }
    }`,
    { id, input: mapInput(input) },
    organizationId,
  );
  return mapCampaign(data.updateCampaign);
};

export const duplicateCampaignViaGraphql = async (id: number, organizationId?: number): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<{ duplicateCampaign: GraphqlCampaign }, { id: number }>(
    `mutation DuplicateCampaign($id: Int!) { duplicateCampaign(id: $id) { ${fields} } }`,
    { id },
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
      scheduleCampaign(id: $id, input: $input) { ${fields} }
    }`,
    { id, input: { scheduledAt, ...(timezone === undefined ? {} : { timezone }) } },
    organizationId,
  );
  return mapCampaign(data.scheduleCampaign);
};

export const unscheduleCampaignViaGraphql = async (id: number, organizationId?: number): Promise<EmailCampaign> => {
  const data = await graphqlMutationRequest<{ unscheduleCampaign: GraphqlCampaign }, { id: number }>(
    `mutation UnscheduleCampaign($id: Int!) { unscheduleCampaign(id: $id) { ${fields} } }`,
    { id },
    organizationId,
  );
  return mapCampaign(data.unscheduleCampaign);
};
