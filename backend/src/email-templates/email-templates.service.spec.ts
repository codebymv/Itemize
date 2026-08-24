import { PageInput } from '../common/pagination';
import { EmailTemplatesRepository } from './email-templates.repository';
import { EmailTemplatesService } from './email-templates.service';

const row = (extra: Record<string, unknown> = {}) => ({
  id: 9,
  organization_id: 4,
  name: 'Welcome',
  subject: 'Hello {{first_name}}',
  body_html: '<p>{{company}} {{first_name}}</p>',
  body_text: null,
  variables: ['first_name', 'company'],
  category: 'onboarding',
  is_active: true,
  created_by: 7,
  created_by_name: 'Template Owner',
  created_at: new Date('2026-07-20T10:00:00.000Z'),
  updated_at: new Date('2026-07-20T11:00:00.000Z'),
  ...extra,
});

describe('EmailTemplatesService', () => {
  let repository: jest.Mocked<EmailTemplatesRepository>;
  let service: EmailTemplatesService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      categories: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      duplicate: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<EmailTemplatesRepository>;
    service = new EmailTemplatesService(repository);
  });

  it('maps deterministic paging filters and PostgreSQL counts', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: '1' });
    await expect(service.list(
      4,
      { category: ' OnBoarding ', isActive: true, search: ' welcome_100% ' },
      Object.assign(new PageInput(), { page: 2, pageSize: 10 }),
    )).resolves.toMatchObject({
      nodes: [{ id: 9, organizationId: 4, bodyHtml: '<p>{{company}} {{first_name}}</p>' }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      category: 'OnBoarding',
      isActive: true,
      searchPattern: '%welcome\\_100\\%%',
      pageSize: 10,
      offset: 10,
    });
  });

  it('extracts unique variables in deterministic content order on create', async () => {
    repository.create.mockResolvedValue(row({ variables: ['first_name', 'company', 'link'] }));
    await service.create(4, 7, {
      name: ' Welcome ',
      subject: 'Hello {{first_name}}',
      bodyHtml: '<p>{{company}} {{first_name}} {{link}}</p>',
      bodyText: '{{company}}',
      category: ' OnBoarding ',
      isActive: true,
    });
    expect(repository.create).toHaveBeenCalledWith(4, 7, expect.objectContaining({
      name: 'Welcome',
      category: 'OnBoarding',
      variables: ['first_name', 'company', 'link'],
    }));
  });

  it('preserves omitted update fields and permits explicit body-text clearing', async () => {
    repository.update.mockResolvedValue(row({ body_text: null }));
    await service.update(4, 9, { bodyText: null, isActive: false });
    expect(repository.update).toHaveBeenCalledWith(4, 9, {
      bodyText: null,
      isActive: false,
    });
  });

  it('rejects blank required content and explicit null required updates', async () => {
    await expect(service.create(4, 7, {
      name: ' ', subject: 'Subject', bodyHtml: '<p>Body</p>', category: 'general', isActive: true,
    })).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(service.update(4, 9, { subject: null })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('conceals foreign IDs for detail, duplicate, and delete', async () => {
    repository.findById.mockResolvedValue(null);
    repository.duplicate.mockResolvedValue(null);
    repository.delete.mockResolvedValue(false);
    await expect(service.detail(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    await expect(service.duplicate(4, 99, 7)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    await expect(service.delete(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
  });
});
