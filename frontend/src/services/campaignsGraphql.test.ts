import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createCampaignViaGraphql,
  deleteCampaignViaGraphql,
  duplicateCampaignViaGraphql,
  getCampaignViaGraphql,
  getCampaignsViaGraphql,
  getCampaignRecipientsViaGraphql,
  previewCampaignViaGraphql,
  sendCampaignTestViaGraphql,
  sendCampaignViaGraphql,
  pauseCampaignViaGraphql,
  resumeCampaignViaGraphql,
  scheduleCampaignViaGraphql,
  unscheduleCampaignViaGraphql,
  updateCampaignViaGraphql,
} from './campaignsGraphql';
import {
  isCampaignAudiencePreviewGraphqlEnabled,
  isCampaignRecipientReadsGraphqlEnabled,
  isCampaignGraphqlMutationsEnabled,
  isCampaignGraphqlReadsEnabled,
  isCampaignTestSendGraphqlEnabled,
  isCampaignSendGraphqlEnabled,
  isCampaignPauseResumeGraphqlEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const campaign = {
  id: 9, organizationId: 4, name: 'Launch', subject: 'Hello', fromName: null,
  fromEmail: null, replyTo: null, templateId: 3, contentHtml: null, contentText: null,
  segmentType: 'segment', segmentId: 12, segmentFilter: {}, tagIds: [], excludedTagIds: [5],
  status: 'draft', scheduledAt: null, sendImmediately: false, timezone: 'UTC', isAbTest: false,
  abVariants: null, abWinnerCriteria: null, abTestDurationHours: 4, totalRecipients: 0,
  totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0,
  totalUnsubscribed: 0, totalComplained: 0, openRate: 0, clickRate: 0, bounceRate: 0,
  createdById: 7, sentById: null, startedAt: null, completedAt: null,
  createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T11:00:00.000Z',
  templateName: 'Welcome', templateHtml: '<p>Hi</p>', createdByName: 'Owner', sentByName: null,
  links: [{ id: 2, campaignId: 9, originalUrl: 'https://itemize.cloud', trackingUrl: null,
    linkText: null, linkPosition: 1, totalClicks: 0, uniqueClicks: 0,
    createdAt: '2026-07-20T10:00:00.000Z' }],
};

const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('campaign GraphQL consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('campaign-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation rollout independent and default-off', () => {
    vi.stubEnv('VITE_CAMPAIGN_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_CAMPAIGN_MUTATIONS_GRAPHQL', 'false');
    vi.stubEnv('VITE_CAMPAIGN_AUDIENCE_PREVIEW_GRAPHQL', 'false');
    vi.stubEnv('VITE_CAMPAIGN_RECIPIENT_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_CAMPAIGN_TEST_SEND_GRAPHQL', 'false');
    vi.stubEnv('VITE_CAMPAIGN_SEND_GRAPHQL', 'false');
    vi.stubEnv('VITE_CAMPAIGN_PAUSE_RESUME_GRAPHQL', 'false');
    expect(isCampaignGraphqlReadsEnabled()).toBe(false);
    expect(isCampaignGraphqlMutationsEnabled()).toBe(false);
    expect(isCampaignAudiencePreviewGraphqlEnabled()).toBe(false);
    expect(isCampaignRecipientReadsGraphqlEnabled()).toBe(false);
    expect(isCampaignTestSendGraphqlEnabled()).toBe(false);
    expect(isCampaignSendGraphqlEnabled()).toBe(false);
    expect(isCampaignPauseResumeGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_CAMPAIGN_READS_GRAPHQL', 'true');
    expect(isCampaignGraphqlReadsEnabled()).toBe(true);
    expect(isCampaignGraphqlMutationsEnabled()).toBe(false);
    expect(isCampaignAudiencePreviewGraphqlEnabled()).toBe(false);
    expect(isCampaignRecipientReadsGraphqlEnabled()).toBe(false);
    expect(isCampaignTestSendGraphqlEnabled()).toBe(false);
    expect(isCampaignSendGraphqlEnabled()).toBe(false);
    expect(isCampaignPauseResumeGraphqlEnabled()).toBe(false);
  });

  it('accepts a bulk campaign into the durable delivery queue', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { sendCampaign: {
      campaign: { ...campaign, status: 'sending', totalRecipients: 2 },
      recipientCount: 2, deliveryJobId: 31, replayed: false,
      message: 'Campaign is now sending',
    } } }));
    await expect(sendCampaignViaGraphql(9, 4, 'campaign-request-31')).resolves.toMatchObject({
      campaign: { id: 9, status: 'sending', total_recipients: 2 },
      recipientCount: 2,
      message: 'Campaign is now sending',
    });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables).toEqual({ campaignId: 9, idempotencyKey: 'campaign-request-31' });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
  });

  it('maps pause and resume through their independent protected lifecycle flag', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { pauseCampaign: {
        campaign: { ...campaign, status: 'paused', totalRecipients: 2 },
        pendingRecipients: 2, message: 'Campaign paused',
      } } }))
      .mockResolvedValueOnce(response({ data: { resumeCampaign: {
        campaign: { id: 9, status: 'sending' }, pendingRecipients: 2,
        message: 'Campaign resumed',
      } } }));
    await expect(pauseCampaignViaGraphql(9, 4)).resolves.toMatchObject({
      id: 9, status: 'paused', total_recipients: 2,
    });
    await expect(resumeCampaignViaGraphql(9, 4)).resolves.toEqual({
      message: 'Campaign resumed', pendingRecipients: 2,
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
  });

  it('maps durable test delivery through a CSRF-protected independent mutation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { sendCampaignTest: {
      success: true, replayed: false, deliveryId: 19, status: 'SENT',
      emailId: 'provider-19', message: 'Test email sent to recipient@test.itemize',
    } } }));
    await expect(sendCampaignTestViaGraphql(
      9, 'recipient@test.itemize', 4, 'test-request-19',
    )).resolves.toEqual({
      success: true,
      message: 'Test email sent to recipient@test.itemize',
      emailId: 'provider-19',
    });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables).toEqual({
      campaignId: 9, testEmail: 'recipient@test.itemize', idempotencyKey: 'test-request-19',
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
  });

  it('maps recipient snapshots, status, and shared paging without CSRF', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { campaignRecipients: {
      nodes: [{
        id: 17, campaignId: 9, contactId: 8, organizationId: 4,
        email: 'recipient@test.itemize', firstName: 'Snapshot', lastName: null, status: 'opened',
        sentAt: '2026-07-21T10:00:00.000Z', deliveredAt: null, openedAt: null,
        clickedAt: null, bouncedAt: null, unsubscribedAt: null, openCount: 2, clickCount: 0,
        clickedLinks: [], errorMessage: null, bounceType: null, abVariant: null,
        emailLogId: 31, externalMessageId: 'provider-17',
        createdAt: '2026-07-21T09:00:00.000Z', updatedAt: '2026-07-21T10:00:00.000Z',
        contactFirstName: 'Current', contactLastName: 'Name',
      }],
      pageInfo: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
    } } }));
    await expect(getCampaignRecipientsViaGraphql(9, { status: 'opened', page: 2, limit: 25 }, 4))
      .resolves.toMatchObject({
        recipients: [{ campaign_id: 9, first_name: 'Snapshot', last_name: undefined,
          contact_first_name: 'Current', open_count: 2, email_log_id: 31,
          external_message_id: 'provider-17' }],
        pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
      });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables).toEqual({
      campaignId: 9, filter: { status: 'opened' }, page: { page: 2, pageSize: 25 },
    });
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });

  it('maps paginated reads, filters, joined fields, and legacy casing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { campaigns: {
      nodes: [campaign], pageInfo: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
    } } }));
    const result = await getCampaignsViaGraphql({ status: 'draft', search: 'launch', page: 2, limit: 25 }, 4);
    expect(result.pagination).toEqual({ page: 2, limit: 25, total: 26, totalPages: 2 });
    expect(result.campaigns[0]).toMatchObject({
      organization_id: 4, segment_id: 12, template_name: 'Welcome',
      links: [{ campaign_id: 9, original_url: 'https://itemize.cloud' }],
    });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables).toEqual({
      filter: { status: 'draft', search: 'launch' }, page: { page: 2, pageSize: 25 },
    });
  });

  it('maps detail and advisory preview without REST envelopes or a CSRF fetch', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { campaign } }))
      .mockResolvedValueOnce(response({ data: { campaignAudiencePreview: {
        recipientCount: 3, segmentType: 'segment', segmentId: 12, tagIds: [], excludedTagIds: [5],
      } } }));
    await expect(getCampaignViaGraphql(9, 4)).resolves.toMatchObject({
      id: 9, created_by_name: 'Owner', template_id: 3,
    });
    await expect(previewCampaignViaGraphql(9, 4)).resolves.toEqual({
      recipientCount: 3, segmentType: 'segment', segmentId: 12, tagIds: [], excludedTagIds: [5],
    });
    const request = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body)).variables).toEqual({ id: 9 });
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });

  it('maps protected management mutations and verifies delete identity', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createCampaign: campaign } }))
      .mockResolvedValueOnce(response({ data: { updateCampaign: campaign } }))
      .mockResolvedValueOnce(response({ data: { duplicateCampaign: { ...campaign, id: 10 } } }))
      .mockResolvedValueOnce(response({ data: { scheduleCampaign: { ...campaign, status: 'scheduled' } } }))
      .mockResolvedValueOnce(response({ data: { unscheduleCampaign: campaign } }))
      .mockResolvedValueOnce(response({ data: { deleteCampaign: { deletedId: 9, success: true } } }));

    await createCampaignViaGraphql({
      name: 'Launch', subject: 'Hello', segment_type: 'segment', segment_id: 12,
      excluded_tag_ids: [5],
    }, 4);
    await updateCampaignViaGraphql(9, { from_name: null, content_text: null }, 4);
    await duplicateCampaignViaGraphql(9, 4);
    await scheduleCampaignViaGraphql(9, '2099-01-01T10:00:00Z', 'America/Phoenix', 4);
    await unscheduleCampaignViaGraphql(9, 4);
    await deleteCampaignViaGraphql(9, 4);

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].variables.input).toEqual({
      name: 'Launch', subject: 'Hello', segmentType: 'segment', segmentId: 12, excludedTagIds: [5],
    });
    expect(bodies[1].variables).toEqual({ id: 9, input: { fromName: null, contentText: null } });
    expect(bodies[3].variables.input).toEqual({
      scheduledAt: '2099-01-01T10:00:00Z', timezone: 'America/Phoenix',
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(6);
  });
});
