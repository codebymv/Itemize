import { PageInput } from '../common/pagination';
import {
  EmailTemplatePublishIdempotencyConflictError,
  EmailTemplatesRepository,
} from './email-templates.repository';
import { EmailTemplatesService } from './email-templates.service';

const row = (extra: Record<string, unknown> = {}) => ({
  id: 9,
  organization_id: 4,
  name: 'Welcome',
  subject: 'Hello {{first_name}}',
  preheader: null,
  body_html: '<p>{{company}} {{first_name}}</p>',
  body_text: null,
  variables: ['first_name', 'company'],
  category: 'onboarding',
  is_active: true,
  created_by: 7,
  created_by_name: 'Template Owner',
  created_at: new Date('2026-07-20T10:00:00.000Z'),
  updated_at: new Date('2026-07-20T11:00:00.000Z'),
  draft_version_id: null,
  published_version_id: 1,
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
      createDraft: jest.fn(),
      saveDraft: jest.fn(),
      publishDraft: jest.fn(),
      update: jest.fn(),
      duplicate: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<EmailTemplatesRepository>;
    service = new EmailTemplatesService(repository);
  });

  it('maps deterministic paging filters and PostgreSQL counts', async () => {
    repository.findPage.mockResolvedValue({
      rows: [row()],
      total: '1',
      stats: { total: '7', active: '5', inactive: '2', categories: '3' },
      categories: [{ category: 'OnBoarding', count: '4' }],
    });
    await expect(service.list(
      4,
      { category: ' OnBoarding ', isActive: true, search: ' welcome_100% ' },
      Object.assign(new PageInput(), { page: 2, pageSize: 10 }),
    )).resolves.toMatchObject({
      nodes: [{ id: 9, organizationId: 4, bodyHtml: '<p>{{company}} {{first_name}}</p>' }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
      stats: { total: 7, active: 5, inactive: 2, categories: 3 },
      categories: [{ category: 'OnBoarding', count: 4 }],
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
    repository.create.mockResolvedValue({
      kind: 'created',
      row: row({ variables: ['first_name', 'company', 'link'] }),
      replayed: false,
    });
    await service.create(4, 7, {
      name: ' Welcome ',
      subject: 'Hello {{first_name}}',
      bodyHtml: '<p>{{company}} {{first_name}} {{link}}</p>',
      bodyText: '{{company}}',
      category: ' OnBoarding ',
      isActive: true,
    }, 'email-create-9');
    expect(repository.create).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({
        name: 'Welcome',
        category: 'OnBoarding',
        variables: ['first_name', 'company', 'link'],
      }),
      'email-create-9',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
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
    }, 'email-create-invalid')).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(service.update(4, 9, { subject: null })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(() => service.preview(Object.assign({
      name: 'Preview', category: 'preview', isActive: false,
      subject: 'Injected\r\nBcc: attacker@example.test', bodyHtml: '<p>Body</p>',
    }))).toThrow('subject must be a single line');
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('keeps draft content separate until explicitly published', async () => {
    repository.createDraft.mockResolvedValue({
      kind: 'created',
      row: row({
        draft_version_id: 20, published_version_id: null, draft_version: 1,
        draft_is_active: true, draft_subject: 'Draft {{first_name}}',
      }),
      replayed: false,
    });
    repository.publishDraft.mockResolvedValue(row({
      draft_version_id: null, published_version_id: 20, published_version: 1,
      subject: 'Draft {{first_name}}',
    }));
    const input = {
      name: 'Draft', subject: 'Draft {{first_name}}', preheader: 'For {{company}}',
      bodyHtml: '<p>Hello {{first_name}}</p>', bodyText: null,
      category: 'marketing', isActive: true,
    };
    await expect(service.createDraft(4, 7, input, 'email-draft-9')).resolves.toMatchObject({
      draftVersion: 1, publishedVersion: null, hasUnpublishedChanges: true,
    });
    expect(repository.createDraft).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({ variables: ['first_name', 'company'], isActive: true }),
      'email-draft-9',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    await expect(service.publishDraft(4, 9, 7, 'publish-key-9', true)).resolves.toMatchObject({
      draftVersion: null, publishedVersion: 1, hasUnpublishedChanges: false,
    });
    expect(repository.publishDraft).toHaveBeenCalledWith(
      4,
      9,
      7,
      'publish-key-9',
      true,
    );
  });

  it('rejects invalid or conflicting publish idempotency keys', async () => {
    await expect(service.publishDraft(4, 9, 7, 'unsafe key', true))
      .rejects.toMatchObject({
        extensions: { reason: 'INVALID_IDEMPOTENCY_KEY' },
      });
    expect(repository.publishDraft).not.toHaveBeenCalled();

    repository.publishDraft.mockRejectedValue(
      new EmailTemplatePublishIdempotencyConflictError(),
    );
    await expect(service.publishDraft(4, 9, 7, 'publish-key-9', true))
      .rejects.toMatchObject({
        extensions: { reason: 'IDEMPOTENCY_KEY_REUSED' },
      });
  });

  it('renders a sanitized branded preview with escaped sample variables', () => {
    const preview = service.preview(Object.assign({
      name: 'Preview', category: 'preview', isActive: false,
      subject: 'Hello {{first_name}}', preheader: 'For {{company}}',
      bodyHtml: '<p>{{first_name}}</p><script>alert(1)</script>', bodyText: null,
    }));
    expect(preview.subject).toBe('Hello Test');
    expect(preview.html).toContain('Example Company');
    expect(preview.html).not.toContain('<script');
  });

  it('conceals foreign IDs for detail, duplicate, and delete', async () => {
    repository.findById.mockResolvedValue(null);
    repository.duplicate.mockResolvedValue({ kind: 'not_found' });
    repository.delete.mockResolvedValue(false);
    await expect(service.detail(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    await expect(service.duplicate(4, 99, 7, 'email-duplicate-99')).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    await expect(service.delete(4, 99)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
  });
});
