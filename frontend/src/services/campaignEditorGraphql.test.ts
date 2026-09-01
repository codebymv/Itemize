import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCampaignEditorBootstrapViaGraphql,
  resetCampaignEditorCapability,
} from './campaignEditorGraphql';

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
  links: [],
};

const template = {
  id: 3, organizationId: 4, name: 'Welcome', subject: 'Hello', preheader: null,
  bodyHtml: '<p>Hello</p>', bodyText: null, variables: [], category: 'onboarding',
  isActive: true, createdById: 7, createdByName: 'Owner',
  createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T11:00:00.000Z',
  draftVersion: null, publishedVersion: 1, draftSubject: null, draftPreheader: null,
  draftBodyHtml: null, draftBodyText: null, draftUpdatedAt: null, draftIsActive: null,
  hasUnpublishedChanges: false,
};

const segment = {
  id: 12, organizationId: 4, name: 'Active contacts', description: null,
  color: '#6366F1', icon: 'users', filterType: 'and', filters: [],
  segmentType: 'dynamic', staticContactIds: [], contactCount: 2,
  lastCalculatedAt: null, isActive: true, usedInCampaigns: 1, usedInAutomations: 0,
  createdById: 7, createdByName: 'Owner', createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T11:00:00.000Z', history: [],
};

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('campaign editor GraphQL bootstrap', () => {
  beforeEach(() => {
    resetCampaignEditorCapability();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps the complete editor lifecycle through one cancellable operation', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        campaignEditorBootstrap: {
          campaign,
          templates: [template],
          segments: [segment],
          filterOptions: {
            fields: [{
              id: 'status', label: 'Status', type: 'select',
              operators: ['equals'], options: null,
            }],
            tags: [], users: [], pipelines: [],
          },
          audiencePreview: {
            recipientCount: 2,
            segmentType: 'segment',
            segmentId: 12,
            tagIds: [],
            excludedTagIds: [5],
          },
        },
      },
    }));
    const controller = new AbortController();

    await expect(getCampaignEditorBootstrapViaGraphql(
      4,
      9,
      controller.signal,
    )).resolves.toMatchObject({
      campaign: { id: 9, name: 'Launch' },
      templates: [{ id: 3, body_html: '<p>Hello</p>' }],
      segments: [{ id: 12, contact_count: 2 }],
      filterOptions: { fields: [{ id: 'status' }] },
      audiencePreview: { recipientCount: 2 },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.query).toContain('query CampaignEditorBootstrap(');
    expect(body.query).toContain('campaignEditorBootstrap(campaignId: $campaignId)');
    expect(body.variables).toEqual({ campaignId: 9 });
    expect(init?.signal).toBe(controller.signal);
  });

  it('remembers a legacy schema after the first missing-field negotiation', async () => {
    const segmentPage = response({ data: { segments: {
      nodes: [segment], pageInfo: { page: 1, totalPages: 1 },
    } } });
    const filterOptions = response({ data: { segmentFilterOptions: {
      fields: [], tags: [], users: [], pipelines: [],
    } } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ errors: [{
        message: 'Cannot query field "campaignEditorBootstrap" on type "Query".',
      }] }))
      .mockResolvedValueOnce(segmentPage)
      .mockResolvedValueOnce(filterOptions)
      .mockResolvedValueOnce(segmentPage)
      .mockResolvedValueOnce(filterOptions);

    await expect(getCampaignEditorBootstrapViaGraphql(4, null)).resolves.toMatchObject({
      campaign: null,
      templates: [],
      segments: [{ id: 12 }],
    });
    await expect(getCampaignEditorBootstrapViaGraphql(4, null)).resolves.toMatchObject({
      campaign: null,
      templates: [],
      segments: [{ id: 12 }],
    });

    const operations = vi.mocked(fetch).mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body));
      return String(body.query).match(/query\s+([A-Za-z0-9_]+)/)?.[1];
    });
    expect(operations.filter((operation) => operation === 'CampaignEditorBootstrap')).toHaveLength(1);
    expect(operations).toEqual([
      'CampaignEditorBootstrap',
      'SegmentPage',
      'SegmentFilterOptions',
      'SegmentPage',
      'SegmentFilterOptions',
    ]);
  });
});
