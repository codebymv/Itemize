import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createCampaignViaGraphql,
  deleteCampaignViaGraphql,
  duplicateCampaignViaGraphql,
  getCampaignViaGraphql,
  getCampaignsViaGraphql,
  previewCampaignViaGraphql,
  scheduleCampaignViaGraphql,
  unscheduleCampaignViaGraphql,
  updateCampaignViaGraphql,
} from './campaignsGraphql';
import {
  isCampaignAudiencePreviewGraphqlEnabled,
  isCampaignGraphqlMutationsEnabled,
  isCampaignGraphqlReadsEnabled,
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
    expect(isCampaignGraphqlReadsEnabled()).toBe(false);
    expect(isCampaignGraphqlMutationsEnabled()).toBe(false);
    expect(isCampaignAudiencePreviewGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_CAMPAIGN_READS_GRAPHQL', 'true');
    expect(isCampaignGraphqlReadsEnabled()).toBe(true);
    expect(isCampaignGraphqlMutationsEnabled()).toBe(false);
    expect(isCampaignAudiencePreviewGraphqlEnabled()).toBe(false);
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
