import { PageInput } from '../common/pagination';
import { CampaignRow, CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

const row = (extra: Partial<CampaignRow> = {}): CampaignRow => ({
  id: 9, organization_id: 4, name: 'Launch', subject: 'Hello', from_name: null,
  from_email: null, reply_to: null, template_id: null, content_html: '<p>Hello</p>',
  content_text: null, segment_type: 'all', segment_id: null, segment_filter: {},
  tag_ids: [], excluded_tag_ids: [], status: 'draft', scheduled_at: null,
  send_immediately: false, timezone: 'UTC', is_ab_test: false, ab_variants: null,
  ab_winner_criteria: null, ab_test_duration_hours: 4, total_recipients: 0,
  total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0,
  total_bounced: 0, total_unsubscribed: 0, total_complained: 0, open_rate: '0.00',
  click_rate: '0.00', bounce_rate: '0.00', created_by: 7, sent_by: null,
  started_at: null, completed_at: null, created_at: new Date('2026-07-20T10:00:00Z'),
  updated_at: new Date('2026-07-20T11:00:00Z'), ...extra,
});

describe('CampaignsService', () => {
  let repository: jest.Mocked<CampaignsRepository>;
  let service: CampaignsService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(),
      duplicate: jest.fn(), delete: jest.fn(), schedule: jest.fn(), unschedule: jest.fn(),
    } as unknown as jest.Mocked<CampaignsRepository>;
    service = new CampaignsService(repository);
  });

  it('maps deterministic paging, escaped search, and PostgreSQL numerics', async () => {
    repository.findPage.mockResolvedValue({ rows: [row({ open_rate: '12.50' })], total: '1' });
    await expect(service.list(
      4,
      { status: 'draft', search: ' launch_100% ' },
      Object.assign(new PageInput(), { page: 2, pageSize: 10 }),
    )).resolves.toMatchObject({
      nodes: [{ id: 9, organizationId: 4, openRate: 12.5, links: [] }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4, status: 'draft', searchPattern: '%launch\\_100\\%%',
      pageSize: 10, offset: 10,
    });
  });

  it('normalizes create fields while retaining the typed audience contract', async () => {
    repository.create.mockResolvedValue(row({ segment_type: 'tag', tag_ids: [12] }));
    await service.create(4, 7, {
      name: ' Launch ', subject: ' Hello ', segmentType: 'tag', tagIds: [12],
      excludedTagIds: [], segmentFilter: {},
    });
    expect(repository.create).toHaveBeenCalledWith(4, 7, expect.objectContaining({
      name: 'Launch', subject: ' Hello ', segmentType: 'tag', tagIds: [12],
      templateId: null, contentText: null,
    }));
  });

  it('preserves omitted update fields and permits explicit nullable-field clearing', async () => {
    repository.update.mockResolvedValue({ kind: 'ok', row: row({ from_name: null }) });
    await service.update(4, 9, { fromName: null, contentText: null });
    expect(repository.update).toHaveBeenCalledWith(4, 9, { fromName: null, contentText: null });
  });

  it('rejects unsupported targeting and invalid lifecycle transitions', async () => {
    await expect(service.create(4, 7, {
      name: 'Launch', subject: 'Subject', segmentType: 'custom', tagIds: [], excludedTagIds: [],
    })).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    repository.unschedule.mockResolvedValue({ kind: 'invalid_status', status: 'sent' });
    await expect(service.unschedule(4, 9)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_STATE', actualStatus: 'sent' },
    });
  });

  it('requires a future absolute schedule and defaults timezone metadata', async () => {
    await expect(service.schedule(4, 9, {
      scheduledAt: '2099-01-01T10:00:00', timezone: 'UTC',
    })).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    repository.schedule.mockResolvedValue({
      kind: 'ok', row: row({ status: 'scheduled', scheduled_at: new Date('2099-01-01T10:00:00Z') }),
    });
    await service.schedule(4, 9, { scheduledAt: '2099-01-01T10:00:00Z', timezone: 'UTC' });
    expect(repository.schedule).toHaveBeenCalledWith(4, 9, new Date('2099-01-01T10:00:00Z'), 'UTC');
  });

  it('conceals foreign detail, duplicate, and delete IDs', async () => {
    repository.findById.mockResolvedValue(null);
    repository.duplicate.mockResolvedValue(null);
    repository.delete.mockResolvedValue({ kind: 'not_found' });
    await expect(service.detail(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    await expect(service.duplicate(4, 99, 7)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    await expect(service.delete(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
  });
});
