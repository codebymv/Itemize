import { FormRow, FormsRepository } from './forms.repository';
import { FormsService } from './forms.service';

const row: FormRow = {
  id: 7,
  organization_id: 4,
  name: 'Registration',
  description: 'Workshop registration',
  slug: 'registration',
  public_id: 'frm_1234567890abcdef1234567890abcdef',
  type: 'form',
  status: 'published',
  submit_button_text: 'Submit',
  success_message: 'Thanks',
  redirect_url: null,
  notify_on_submit: true,
  notification_emails: [],
  theme: {},
  create_contact: true,
  contact_tags: [],
  created_by: 2,
  submission_count: 5,
  field_count: 3,
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-02T00:00:00.000Z'),
};

describe('FormsService', () => {
  it('returns one escaped, filtered page with organization-wide stats', async () => {
    const repository = {
      findPage: jest.fn().mockResolvedValue({
        rows: [row],
        total: 1,
        stats: { total: 12, draft: 4, published: 7, archived: 1 },
      }),
    } as unknown as jest.Mocked<FormsRepository>;
    const service = new FormsService(repository);

    await expect(service.listPage(
      4,
      { status: 'published', search: '  50%_registration  ' },
      { page: 2, pageSize: 10 },
    )).resolves.toMatchObject({
      nodes: [{ id: 7, fieldCount: 3, submissionCount: 5 }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
      stats: { total: 12, draft: 4, published: 7, archived: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      status: 'published',
      searchPattern: '%50\\%\\_registration%',
      pageSize: 10,
      offset: 10,
    });
  });
});
