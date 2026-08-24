import { LandingPagesRepository } from './landing-pages.repository';
import { LandingPagesService } from './landing-pages.service';

const pageRow = {
  id: 12,
  organization_id: 4,
  name: 'Launch page',
  description: null,
  slug: 'launch-page',
  status: 'draft',
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  og_image: null,
  favicon_url: null,
  theme: { primaryColor: '#000000' },
  custom_css: null,
  custom_js: null,
  custom_head: null,
  settings: { enableAnalytics: true },
  current_version_id: null,
  view_count: 3,
  unique_visitors: 2,
  published_at: null,
  created_by: 7,
  created_by_name: 'Owner',
  created_at: new Date('2026-07-20T10:00:00.000Z'),
  updated_at: new Date('2026-07-20T11:00:00.000Z'),
  section_count: 1,
};

const sectionRow = {
  id: 21,
  page_id: 12,
  organization_id: 4,
  section_type: 'hero',
  name: 'Hero',
  content: { heading: 'Hello' },
  settings: { visible: true },
  section_order: 0,
  created_at: new Date('2026-07-20T10:00:00.000Z'),
  updated_at: new Date('2026-07-20T11:00:00.000Z'),
};

describe('LandingPagesService', () => {
  let repository: jest.Mocked<LandingPagesRepository>;
  let service: LandingPagesService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      setPasswordHash: jest.fn(),
      removePassword: jest.fn(),
      duplicate: jest.fn(),
      replaceSections: jest.fn(),
      addSection: jest.fn(),
      updateSection: jest.fn(),
      deleteSection: jest.fn(),
      reorderSections: jest.fn(),
      analytics: jest.fn(),
    } as unknown as jest.Mocked<LandingPagesRepository>;
    service = new LandingPagesService(repository);
  });

  it('normalizes create input and distinguishes generated from explicit slugs', async () => {
    repository.create.mockResolvedValue({
      page: pageRow,
      sections: [sectionRow],
    });

    await expect(
      service.create(4, 7, {
        name: '  Launch page  ',
        sections: [
          {
            sectionType: 'hero',
            name: 'Hero',
            content: { heading: 'Hello' },
          },
        ],
      }),
    ).resolves.toMatchObject({
      id: 12,
      organizationId: 4,
      sections: [{ id: 21, sectionType: 'hero' }],
    });
    expect(repository.create).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({
        name: 'Launch page',
        slug: 'launch-page',
        autoAllocateSlug: true,
        sections: [
          expect.objectContaining({
            sectionType: 'hero',
            name: 'Hero',
            content: { heading: 'Hello' },
          }),
        ],
      }),
    );

    repository.create.mockClear();
    await service.create(4, 7, {
      name: 'Launch page',
      slug: 'custom-launch',
    });
    expect(repository.create).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({
        slug: 'custom-launch',
        autoAllocateSlug: false,
      }),
    );
  });

  it('maps plan limits and duplicate slugs to stable GraphQL errors', async () => {
    repository.create.mockResolvedValueOnce({
      limit: { current: 10, limit: 10, plan: 'starter' },
    });
    await expect(
      service.create(4, 7, { name: 'Over limit' }),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'FORBIDDEN',
        reason: 'PLAN_LIMIT_REACHED',
        current: 10,
      }),
    });

    repository.create.mockRejectedValueOnce({ code: '23505' });
    await expect(
      service.create(4, 7, { name: 'Conflict', slug: 'existing' }),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'CONFLICT',
        field: 'slug',
      }),
    });
  });

  it('requires reorder requests to contain the authoritative section set', async () => {
    repository.reorderSections.mockResolvedValue({ matched: false, rows: [] });
    await expect(service.reorderSections(4, 12, [21])).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        reason: 'SECTION_SET_MISMATCH',
      }),
    });

    await expect(
      service.reorderSections(4, 12, [21, 21]),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'sectionIds',
      }),
    });

    repository.reorderSections.mockResolvedValue({ matched: false, rows: [] });
    await expect(service.reorderSections(4, 12, [])).rejects.toMatchObject({
      extensions: expect.objectContaining({
        reason: 'SECTION_SET_MISMATCH',
      }),
    });
  });

  it('maps analytics and rejects unbounded periods before querying', async () => {
    repository.analytics.mockResolvedValue({
      overall: {
        total_views: 9,
        unique_visitors: 5,
        avg_time_on_page: null,
        avg_scroll_depth: 62.5,
        conversions: 2,
      },
      views: [
        {
          date: new Date('2026-07-20T00:00:00.000Z'),
          views: 9,
          unique_visitors: 5,
        },
      ],
      devices: [{ device_type: null, count: 9 }],
      referrers: [{ referrer: 'Direct', count: 9 }],
      utm: [
        {
          utm_source: 'newsletter',
          utm_medium: null,
          utm_campaign: null,
          count: 2,
        },
      ],
    });
    await expect(service.analytics(4, 12, 30)).resolves.toMatchObject({
      period: 30,
      overall: { totalViews: 9, averageTimeOnPage: 0 },
      devices: [{ deviceType: null, count: 9 }],
      utmSources: [{ utmSource: 'newsletter' }],
    });

    await expect(service.analytics(4, 12, 366)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'period',
      }),
    });
    expect(repository.analytics).toHaveBeenCalledTimes(1);
  });

  it('hashes bounded page passwords and removes them without leaking the hash', async () => {
    repository.setPasswordHash.mockResolvedValue(true);
    await expect(service.setPassword(4, 12, 'open-sesame')).resolves.toEqual({
      pageId: 12,
      passwordProtected: true,
    });
    expect(repository.setPasswordHash).toHaveBeenCalledWith(
      4,
      12,
      expect.stringMatching(/^\$2[aby]\$/),
    );
    expect(repository.setPasswordHash.mock.calls[0][2]).not.toContain(
      'open-sesame',
    );

    repository.removePassword.mockResolvedValue(true);
    await expect(service.removePassword(4, 12)).resolves.toEqual({
      pageId: 12,
      passwordProtected: false,
    });
    expect(repository.removePassword).toHaveBeenCalledWith(4, 12);
  });

  it('rejects passwords that bcrypt would truncate before hashing', async () => {
    await expect(service.setPassword(4, 12, 'abc')).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'password',
      }),
    });
    await expect(
      service.setPassword(4, 12, 'é'.repeat(37)),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'password',
      }),
    });
    expect(repository.setPasswordHash).not.toHaveBeenCalled();
  });
});
