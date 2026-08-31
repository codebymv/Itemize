import { CampaignsService } from '../campaigns/campaigns.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { SegmentsService } from '../segments/segments.service';
import { CampaignEditorService } from './campaign-editor.service';

describe('CampaignEditorService', () => {
  const campaigns = {
    detail: jest.fn(),
    audiencePreview: jest.fn(),
  } as unknown as jest.Mocked<CampaignsService>;
  const templates = {
    list: jest.fn(),
  } as unknown as jest.Mocked<EmailTemplatesService>;
  const segments = {
    list: jest.fn(),
    filterOptions: jest.fn(),
  } as unknown as jest.Mocked<SegmentsService>;
  const service = new CampaignEditorService(campaigns, templates, segments);
  const pageInfo = (page: number, totalPages: number) => ({
    page,
    pageSize: 100,
    total: totalPages * 100,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    templates.list.mockResolvedValue({ nodes: [], pageInfo: pageInfo(1, 0) });
    segments.list.mockResolvedValue({ nodes: [], pageInfo: pageInfo(1, 0) });
    segments.filterOptions.mockResolvedValue({
      fields: [], tags: [], users: [], pipelines: [],
    });
  });

  it('prepares a new editor without requesting campaign-owned data', async () => {
    await expect(service.bootstrap(42, null)).resolves.toEqual({
      campaign: null,
      templates: [],
      segments: [],
      filterOptions: { fields: [], tags: [], users: [], pipelines: [] },
      audiencePreview: null,
    });
    expect(campaigns.detail).not.toHaveBeenCalled();
    expect(campaigns.audiencePreview).not.toHaveBeenCalled();
  });

  it('includes audience preview only while a campaign is editable', async () => {
    const campaign = { id: 7, status: 'scheduled' } as never;
    const preview = { recipientCount: 12 } as never;
    campaigns.detail.mockResolvedValue(campaign);
    campaigns.audiencePreview.mockResolvedValue(preview);

    await expect(service.bootstrap(42, 7)).resolves.toMatchObject({
      campaign,
      audiencePreview: preview,
    });
    expect(campaigns.audiencePreview).toHaveBeenCalledWith(42, 7);

    campaigns.detail.mockResolvedValue({ id: 7, status: 'sent' } as never);
    await expect(service.bootstrap(42, 7)).resolves.toMatchObject({
      audiencePreview: null,
    });
    expect(campaigns.audiencePreview).toHaveBeenCalledTimes(1);
  });

  it('returns complete template and segment catalogs across pages', async () => {
    templates.list
      .mockResolvedValueOnce({
        nodes: [{ id: 1 } as never],
        pageInfo: pageInfo(1, 2),
      })
      .mockResolvedValueOnce({
        nodes: [{ id: 2 } as never],
        pageInfo: pageInfo(2, 2),
      });
    segments.list
      .mockResolvedValueOnce({
        nodes: [{ id: 3 } as never],
        pageInfo: pageInfo(1, 2),
      })
      .mockResolvedValueOnce({
        nodes: [{ id: 4 } as never],
        pageInfo: pageInfo(2, 2),
      });

    await expect(service.bootstrap(42, null)).resolves.toMatchObject({
      templates: [{ id: 1 }, { id: 2 }],
      segments: [{ id: 3 }, { id: 4 }],
    });
    expect(templates.list).toHaveBeenNthCalledWith(
      2,
      42,
      {},
      expect.objectContaining({ page: 2, pageSize: 100 }),
    );
    expect(segments.list).toHaveBeenNthCalledWith(
      2,
      42,
      {},
      expect.objectContaining({ page: 2, pageSize: 100 }),
    );
  });
});
