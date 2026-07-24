import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  addLandingPageSectionViaGraphql,
  createLandingPageViaGraphql,
  deleteLandingPageSectionViaGraphql,
  deleteLandingPageViaGraphql,
  duplicateLandingPageViaGraphql,
  getLandingPageAnalyticsViaGraphql,
  getLandingPageViaGraphql,
  getLandingPagesViaGraphql,
  reorderLandingPageSectionsViaGraphql,
  removeLandingPagePasswordViaGraphql,
  replaceLandingPageSectionsViaGraphql,
  setLandingPagePasswordViaGraphql,
  updateLandingPageSectionViaGraphql,
  updateLandingPageViaGraphql,
} from './landingPagesGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const section = {
  id: 21,
  pageId: 12,
  organizationId: 4,
  sectionType: 'hero',
  name: 'Hero',
  content: { heading: 'Hello' },
  settings: { visible: true },
  sectionOrder: 0,
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T11:00:00.000Z',
};

const page = {
  id: 12,
  organizationId: 4,
  name: 'Launch',
  description: null,
  slug: 'launch',
  status: 'draft',
  seoTitle: null,
  seoDescription: null,
  seoKeywords: null,
  ogImage: null,
  faviconUrl: null,
  theme: { primaryColor: '#000000' },
  customCss: null,
  customJs: null,
  customHead: null,
  settings: { enableAnalytics: true },
  passwordProtected: false,
  currentVersionId: null,
  viewCount: 3,
  uniqueVisitors: 2,
  publishedAt: null,
  createdBy: 7,
  createdByName: 'Owner',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T11:00:00.000Z',
  sectionCount: 1,
  sections: [section],
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

const requestBodies = () =>
  vi.mocked(fetch).mock.calls.map((call) =>
    JSON.parse(String((call[1] as RequestInit).body)) as {
      query: string;
      variables: Record<string, unknown>;
    });

describe('landing-page GraphQL consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('pages-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps tenant-scoped list and detail reads without CSRF', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            landingPages: {
              nodes: [page],
              pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
            },
          },
        }),
      )
      .mockResolvedValueOnce(response({ data: { landingPage: page } }));

    await expect(
      getLandingPagesViaGraphql(
        { status: 'draft', search: 'launch', page: 2, limit: 10 },
        4,
      ),
    ).resolves.toMatchObject({
      pages: [
        {
          organization_id: 4,
          view_count: 3,
          sections: [{ page_id: 12, section_type: 'hero' }],
        },
      ],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
    await expect(getLandingPageViaGraphql(12, 4)).resolves.toMatchObject({
      id: 12,
      created_by_name: 'Owner',
    });

    expect(requestBodies()[0].variables).toEqual({
      filter: { status: 'draft', search: 'launch' },
      page: { page: 2, pageSize: 10 },
    });
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });

  it('uses protected GraphQL mutations for every page and section write', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createLandingPage: page } }))
      .mockResolvedValueOnce(response({ data: { updateLandingPage: page } }))
      .mockResolvedValueOnce(
        response({ data: { duplicateLandingPage: { ...page, id: 13 } } }),
      )
      .mockResolvedValueOnce(
        response({ data: { replaceLandingPageSections: { sections: [section] } } }),
      )
      .mockResolvedValueOnce(response({ data: { addLandingPageSection: section } }))
      .mockResolvedValueOnce(response({ data: { updateLandingPageSection: section } }))
      .mockResolvedValueOnce(
        response({ data: { reorderLandingPageSections: { sections: [section] } } }),
      )
      .mockResolvedValueOnce(
        response({ data: { deleteLandingPageSection: { deletedId: 21 } } }),
      )
      .mockResolvedValueOnce(
        response({ data: { deleteLandingPage: { deletedId: 12 } } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            setLandingPagePassword: {
              pageId: 12,
              passwordProtected: true,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            removeLandingPagePassword: {
              pageId: 12,
              passwordProtected: false,
            },
          },
        }),
      );

    await createLandingPageViaGraphql(
      {
        name: 'Launch',
        seo_title: 'Launch SEO',
        sections: [{ section_type: 'hero', content: { heading: 'Hello' } }],
      },
      4,
    );
    await updateLandingPageViaGraphql(
      12,
      { custom_css: '.hero {}', description: null },
      4,
    );
    await duplicateLandingPageViaGraphql(12, 4);
    await replaceLandingPageSectionsViaGraphql(
      12,
      [{ section_type: 'hero', content: { heading: 'Hello' } }],
      4,
    );
    await addLandingPageSectionViaGraphql(
      12,
      { section_type: 'hero', position: 0 },
      4,
    );
    await updateLandingPageSectionViaGraphql(
      12,
      21,
      { name: 'Updated' },
      4,
    );
    await reorderLandingPageSectionsViaGraphql(12, [21], 4);
    await expect(deleteLandingPageSectionViaGraphql(12, 21, 4)).resolves.toEqual({
      success: true,
    });
    await expect(deleteLandingPageViaGraphql(12, 4)).resolves.toEqual({
      success: true,
    });
    await expect(
      setLandingPagePasswordViaGraphql(12, 'open-sesame', 4),
    ).resolves.toEqual({ pageId: 12, passwordProtected: true });
    await expect(
      removeLandingPagePasswordViaGraphql(12, 4),
    ).resolves.toEqual({ pageId: 12, passwordProtected: false });

    const bodies = requestBodies();
    expect(bodies.map(({ query }) => query)).toEqual([
      expect.stringContaining('createLandingPage'),
      expect.stringContaining('updateLandingPage'),
      expect.stringContaining('duplicateLandingPage'),
      expect.stringContaining('replaceLandingPageSections'),
      expect.stringContaining('addLandingPageSection'),
      expect.stringContaining('updateLandingPageSection'),
      expect.stringContaining('reorderLandingPageSections'),
      expect.stringContaining('deleteLandingPageSection'),
      expect.stringContaining('deleteLandingPage'),
      expect.stringContaining('setLandingPagePassword'),
      expect.stringContaining('removeLandingPagePassword'),
    ]);
    expect(bodies[0].variables).toEqual({
      input: {
        name: 'Launch',
        seoTitle: 'Launch SEO',
        sections: [
          {
            sectionType: 'hero',
            content: { heading: 'Hello' },
            settings: {},
          },
        ],
      },
    });
    expect(bodies[1].variables).toEqual({
      id: 12,
      input: { customCss: '.hero {}', description: null },
    });
    expect(bodies[9].variables).toEqual({
      pageId: 12,
      password: 'open-sesame',
    });
    expect(bodies[10].variables).toEqual({ pageId: 12 });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(11);
    for (const call of vi.mocked(fetch).mock.calls) {
      expect((call[1] as RequestInit).headers).toMatchObject({
        'x-organization-id': '4',
        'x-csrf-token': 'pages-csrf',
      });
    }
  });

  it('maps the analytics aggregate through GraphQL without mutation headers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        data: {
          landingPageAnalytics: {
            period: 30,
            overall: {
              totalViews: 9,
              uniqueVisitors: 5,
              averageTimeOnPage: 12.5,
              averageScrollDepth: 62.5,
              conversions: 2,
            },
            viewsOverTime: [
              { date: '2026-07-20T00:00:00.000Z', views: 9, uniqueVisitors: 5 },
            ],
            devices: [{ deviceType: null, count: 9 }],
            referrers: [{ referrer: 'Direct', count: 9 }],
            utmSources: [
              {
                utmSource: 'newsletter',
                utmMedium: null,
                utmCampaign: null,
                count: 2,
              },
            ],
          },
        },
      }),
    );

    await expect(getLandingPageAnalyticsViaGraphql(12, 30, 4)).resolves.toEqual({
      period: 30,
      overall: {
        total_views: 9,
        unique_visitors: 5,
        avg_time_on_page: 12.5,
        avg_scroll_depth: 62.5,
        conversions: 2,
      },
      views_over_time: [
        { date: '2026-07-20T00:00:00.000Z', views: 9, unique_visitors: 5 },
      ],
      devices: [{ device_type: 'unknown', count: 9 }],
      referrers: [{ referrer: 'Direct', count: 9 }],
      utm_sources: [
        {
          utm_source: 'newsletter',
          utm_medium: '',
          utm_campaign: '',
          count: 2,
        },
      ],
    });
    expect(requestBodies()[0].variables).toEqual({ id: 12, period: 30 });
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });
});
