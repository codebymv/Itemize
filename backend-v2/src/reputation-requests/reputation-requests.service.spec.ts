import { ReputationRequestsRepository } from './reputation-requests.repository';
import { ReputationRequestsService } from './reputation-requests.service';

const row = {
  id: 8, organization_id: 3, contact_id: 4, contact_email: 'snapshot@example.test',
  contact_phone: null, contact_name: 'Ada', channel: 'email', template_id: null,
  email_sent: true, email_sent_at: new Date('2026-07-21T10:00:00Z'),
  email_opened: false, email_opened_at: null, sms_sent: false, sms_sent_at: null,
  clicked: false, clicked_at: null, rating_given: null, review_submitted: false,
  review_submitted_at: null, review_id: null, preferred_platform: null,
  redirect_url: null, status: 'sent', scheduled_at: null, expires_at: null,
  custom_message: null, created_at: new Date('2026-07-21T09:00:00Z'),
  updated_at: new Date('2026-07-21T10:00:00Z'), contact_first_name: 'Ada',
  contact_last_name: 'Lovelace', current_contact_email: 'current@example.test',
};

describe('ReputationRequestsService', () => {
  let repository: jest.Mocked<ReputationRequestsRepository>;
  let service: ReputationRequestsService;

  beforeEach(() => {
    repository = { findPage: jest.fn(), delete: jest.fn() } as unknown as jest.Mocked<ReputationRequestsRepository>;
    service = new ReputationRequestsService(repository);
  });

  it('normalizes status/page input and maps the retained request projection', async () => {
    repository.findPage.mockResolvedValue({ rows: [row], total: 21 });
    await expect(service.list(3, { status: 'SENT' }, { page: 2, pageSize: 10 }))
      .resolves.toMatchObject({
        nodes: [{
          id: 8, organizationId: 3, contactId: 4, emailSent: true,
          status: 'sent', contactFirstName: 'Ada', currentContactEmail: 'current@example.test',
        }],
        pageInfo: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
      });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 3, status: 'sent', pageSize: 10, offset: 10,
    });
  });

  it('rejects invalid filters and unbounded pages before repository access', async () => {
    await expect(service.list(3, { status: 'unknown' })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'filter.status' },
    });
    await expect(service.list(3, {}, { page: 1, pageSize: 101 })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'page.pageSize' },
    });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('returns exact delete identity and keeps missing rows private', async () => {
    repository.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.delete(3, 8)).resolves.toBe(8);
    await expect(service.delete(3, 9)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
