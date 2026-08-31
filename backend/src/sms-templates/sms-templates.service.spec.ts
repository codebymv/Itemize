import { PageInput } from '../common/pagination';
import { SmsTemplatesRepository } from './sms-templates.repository';
import { SmsTemplatesService } from './sms-templates.service';

const row = (extra: Record<string, unknown> = {}) => ({
  id: 9,
  organization_id: 4,
  name: 'Reminder',
  message: 'Hi {{first_name}}',
  variables: ['first_name'],
  category: 'Reminders',
  is_active: true,
  created_by: 7,
  created_by_name: 'Template Owner',
  created_at: new Date('2026-07-20T10:00:00.000Z'),
  updated_at: new Date('2026-07-20T11:00:00.000Z'),
  ...extra,
});

describe('SmsTemplatesService', () => {
  let repository: jest.Mocked<SmsTemplatesRepository>;
  let service: SmsTemplatesService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      categories: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      duplicate: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<SmsTemplatesRepository>;
    service = new SmsTemplatesService(repository);
  });

  it('maps one filtered page with global catalog metadata', async () => {
    repository.findPage.mockResolvedValue({
      rows: [row()],
      total: '1',
      stats: { total: '7', active: '5', inactive: '2', categories: '3' },
      categories: [{ category: 'Reminders', count: '4' }],
    });

    await expect(service.list(
      4,
      { category: ' Reminders ', isActive: true, search: ' reminder_100% ' },
      Object.assign(new PageInput(), { page: 2, pageSize: 10 }),
    )).resolves.toMatchObject({
      nodes: [{ id: 9, organizationId: 4, message: 'Hi {{first_name}}' }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
      stats: { total: 7, active: 5, inactive: 2, categories: 3 },
      categories: [{ category: 'Reminders', count: 4 }],
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      category: 'Reminders',
      isActive: true,
      searchPattern: '%reminder\\_100\\%%',
      pageSize: 10,
      offset: 10,
    });
  });

  it('rejects unsafe aggregate counts', async () => {
    repository.findPage.mockResolvedValue({
      rows: [],
      total: '0',
      stats: { total: '9007199254740992', active: '0', inactive: '0', categories: '0' },
      categories: [],
    });
    await expect(service.list(4)).rejects.toThrow('Unsafe SMS-template count');
  });
});
