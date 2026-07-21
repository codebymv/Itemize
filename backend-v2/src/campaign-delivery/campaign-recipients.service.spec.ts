import { PageInput } from '../common/pagination';
import { CampaignRecipientRow, CampaignRecipientsRepository } from './campaign-recipients.repository';
import { CampaignRecipientsService } from './campaign-recipients.service';

const row = (extra: Partial<CampaignRecipientRow> = {}): CampaignRecipientRow => ({
  id: 11, campaign_id: 9, contact_id: 8, organization_id: 4,
  email: 'recipient@test.itemize', first_name: 'Snapshot', last_name: null,
  status: 'opened', sent_at: new Date('2026-07-21T10:00:00Z'),
  delivered_at: new Date('2026-07-21T10:01:00Z'), opened_at: new Date('2026-07-21T10:02:00Z'),
  clicked_at: null, bounced_at: null, unsubscribed_at: null,
  open_count: 2, click_count: 0, clicked_links: [], error_message: null,
  bounce_type: null, email_log_id: 3, external_message_id: 'provider-1', ab_variant: null,
  created_at: new Date('2026-07-21T09:59:00Z'), updated_at: new Date('2026-07-21T10:02:00Z'),
  contact_first_name: 'Current', contact_last_name: 'Name', ...extra,
});

describe('CampaignRecipientsService', () => {
  let repository: jest.Mocked<CampaignRecipientsRepository>;
  let service: CampaignRecipientsService;

  beforeEach(() => {
    repository = { findPage: jest.fn() } as unknown as jest.Mocked<CampaignRecipientsRepository>;
    service = new CampaignRecipientsService(repository);
  });

  it('maps snapshots and deterministic shared pagination', async () => {
    repository.findPage.mockResolvedValue({ kind: 'ok', rows: [row()], total: '11' });
    await expect(service.list(
      4, 9, { status: 'opened' }, Object.assign(new PageInput(), { page: 2, pageSize: 10 }),
    )).resolves.toMatchObject({
      nodes: [{ id: 11, campaignId: 9, contactFirstName: 'Current', openCount: 2 }],
      pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4, campaignId: 9, status: 'opened', pageSize: 10, offset: 10,
    });
  });

  it('treats all as no filter and rejects invalid status and paging', async () => {
    repository.findPage.mockResolvedValue({ kind: 'ok', rows: [], total: '0' });
    await service.list(4, 9, { status: 'all' });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4, campaignId: 9, pageSize: 50, offset: 0,
    });
    await expect(service.list(4, 9, { status: 'unknown' })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_RECIPIENT_STATUS' },
    });
    await expect(service.list(4, 9, {}, Object.assign(new PageInput(), { pageSize: 101 })))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_PAGE' } });
  });

  it('conceals a campaign outside the selected organization', async () => {
    repository.findPage.mockResolvedValue({ kind: 'not_found' });
    await expect(service.list(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
  });

  it('fails closed on unsafe database numerics and malformed identifiers', async () => {
    repository.findPage.mockResolvedValue({ kind: 'ok', rows: [row({ open_count: -1 })], total: '1' });
    await expect(service.list(4, 9)).rejects.toThrow('Unsafe campaign recipient count');
    await expect(service.list(4, 0)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_ID' },
    });
  });
});
