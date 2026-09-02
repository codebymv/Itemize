import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createEmailTemplateViaGraphql,
  createEmailTemplateDraftViaGraphql,
  deleteEmailTemplateViaGraphql,
  duplicateEmailTemplateViaGraphql,
  getEmailTemplateCategoriesViaGraphql,
  getEmailTemplateViaGraphql,
  getEmailTemplatesViaGraphql,
  previewEmailTemplateViaGraphql,
  publishEmailTemplateViaGraphql,
  resetEmailTemplateListCapability,
  saveEmailTemplateDraftViaGraphql,
  updateEmailTemplateViaGraphql,
} from './emailTemplatesGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const template = {
  id: 9,
  organizationId: 4,
  name: 'Welcome',
  subject: 'Hello {{first_name}}',
  preheader: 'Welcome to {{company}}',
  bodyHtml: '<p>{{company}}</p>',
  bodyText: null,
  variables: ['first_name', 'company'],
  category: 'onboarding',
  isActive: true,
  createdById: 7,
  createdByName: 'Owner',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T11:00:00.000Z',
  draftVersion: null,
  publishedVersion: 1,
  draftSubject: null,
  draftPreheader: null,
  draftBodyHtml: null,
  draftBodyText: null,
  draftUpdatedAt: null,
  draftIsActive: null,
  hasUnpublishedChanges: false,
};

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('email-template GraphQL consumer', () => {
  beforeEach(() => {
    resetEmailTemplateListCapability();
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('template-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads one bounded page with global catalog metadata and cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { emailTemplates: {
      nodes: [template],
      pageInfo: { page: 2, pageSize: 20, total: 21, totalPages: 2, hasNextPage: false },
      stats: { total: 40, active: 32, inactive: 8, categories: 4 },
      categories: [{ category: 'onboarding', count: 12 }],
    } } }));

    const result = await getEmailTemplatesViaGraphql(
      { category: 'onboarding', is_active: true, search: ' welcome ', page: 2, limit: 20 },
      4,
      controller.signal,
    );
    expect(result).toMatchObject({
      total: 21,
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
      stats: { total: 40, active: 32, inactive: 8, categories: 4 },
      categories: [{ category: 'onboarding', count: 12 }],
    });
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]).toMatchObject({
      id: 9, organization_id: 4, body_html: '<p>{{company}}</p>', is_active: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables.page).toEqual({ page: 2, pageSize: 20 });
    expect(body.variables.filter).toEqual({
      category: 'onboarding', isActive: true, search: 'welcome',
    });
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it('negotiates legacy catalog metadata once without walking result pages', async () => {
    const legacyPayload = response({ data: {
      filtered: {
        nodes: [template],
        pageInfo: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
      },
      all: { pageInfo: { total: 8 } },
      active: { pageInfo: { total: 6 } },
      inactive: { pageInfo: { total: 2 } },
      emailTemplateCategories: [{ category: 'onboarding', count: 3 }],
    } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ errors: [{
        message: 'Cannot query field "stats" on type "EmailTemplatePage".',
      }] }))
      .mockResolvedValueOnce(legacyPayload)
      .mockResolvedValueOnce(legacyPayload);

    await expect(getEmailTemplatesViaGraphql({ page: 1, limit: 20 }, 4)).resolves.toMatchObject({
      templates: [{ id: 9 }],
      stats: { total: 8, active: 6, inactive: 2, categories: 1 },
    });
    await getEmailTemplatesViaGraphql({ page: 1, limit: 20 }, 4);

    const operations = vi.mocked(fetch).mock.calls.map(([, init]) => {
      const request = JSON.parse(String((init as RequestInit).body));
      return String(request.query).match(/query\s+([A-Za-z0-9_]+)/)?.[1];
    });
    expect(operations).toEqual(['EmailTemplates', 'EmailTemplatesLegacy', 'EmailTemplatesLegacy']);
  });

  it('maps detail and category reads without response-envelope drift', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { emailTemplate: template } }))
      .mockResolvedValueOnce(response({ data: {
        emailTemplateCategories: [{ category: 'onboarding', count: 2 }],
      } }));
    await expect(getEmailTemplateViaGraphql(9, 4)).resolves.toMatchObject({
      id: 9, created_by_name: 'Owner', body_text: null,
    });
    await expect(getEmailTemplateCategoriesViaGraphql(4)).resolves.toEqual({
      categories: [{ category: 'onboarding', count: 2 }],
    });
  });

  it('maps protected create, partial update, duplicate, and verified delete', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createEmailTemplate: template } }))
      .mockResolvedValueOnce(response({ data: { updateEmailTemplate: template } }))
      .mockResolvedValueOnce(response({ data: { duplicateEmailTemplate: { ...template, id: 10, isActive: false } } }))
      .mockResolvedValueOnce(response({ data: { deleteEmailTemplate: { deletedId: 9, success: true } } }));

    await createEmailTemplateViaGraphql({
      organization_id: 4,
      name: 'Welcome', subject: 'Hello', body_html: '<p>Hello</p>', is_active: true,
    }, 'email-create-9', 4);
    await updateEmailTemplateViaGraphql(9, { body_text: null, is_active: false }, 4);
    await duplicateEmailTemplateViaGraphql(9, 'email-duplicate-9', 4);
    await deleteEmailTemplateViaGraphql(9, 4);

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toEqual({
      name: 'Welcome', subject: 'Hello', bodyHtml: '<p>Hello</p>', isActive: true,
    });
    expect(bodies[0].variables.idempotencyKey).toBe('email-create-9');
    expect(bodies[1].variables).toEqual({ id: 9, input: { bodyText: null, isActive: false } });
    expect(bodies[2].variables).toEqual({ id: 9, idempotencyKey: 'email-duplicate-9' });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(4);
  });

  it('maps the safe draft, preview, and publish lifecycle', async () => {
    const draft = {
      ...template,
      publishedVersion: null,
      draftVersion: 1,
      draftSubject: 'Draft {{first_name}}',
      draftPreheader: 'Draft preview',
      draftBodyHtml: '<p>Draft</p>',
      draftIsActive: true,
      hasUnpublishedChanges: true,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createEmailTemplateDraft: draft } }))
      .mockResolvedValueOnce(response({ data: { saveEmailTemplateDraft: draft } }))
      .mockResolvedValueOnce(response({ data: { previewEmailTemplate: {
        subject: 'Draft Test', html: '<html>safe preview</html>', text: null,
        variables: ['first_name'],
      } } }))
      .mockResolvedValueOnce(response({ data: { publishEmailTemplate: template } }));

    await expect(createEmailTemplateDraftViaGraphql({
      name: 'Draft', subject: 'Draft {{first_name}}', preheader: 'Draft preview',
      body_html: '<p>Draft</p>', category: 'marketing', is_active: true,
    }, 'email-draft-9', 4)).resolves.toMatchObject({ draft_version: 1, has_unpublished_changes: true });
    await saveEmailTemplateDraftViaGraphql(9, {
      name: 'Draft', subject: 'Draft {{first_name}}', preheader: 'Draft preview',
      body_html: '<p>Draft</p>', category: 'marketing', is_active: true,
    }, 4);
    await expect(previewEmailTemplateViaGraphql({
      subject: 'Draft {{first_name}}', preheader: 'Draft preview', body_html: '<p>Draft</p>',
    }, 4)).resolves.toMatchObject({ subject: 'Draft Test', variables: ['first_name'] });
    await publishEmailTemplateViaGraphql(9, true, 'publish-key-9', 4);

    const bodies = vi.mocked(fetch).mock.calls.map(call =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toMatchObject({ preheader: 'Draft preview', isActive: true });
    expect(bodies[0].variables.idempotencyKey).toBe('email-draft-9');
    expect(bodies[2].variables.input).toEqual({
      subject: 'Draft {{first_name}}', preheader: 'Draft preview', bodyHtml: '<p>Draft</p>',
    });
    expect(bodies[3].variables).toEqual({
      id: 9,
      input: { isActive: true, idempotencyKey: 'publish-key-9' },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(4);
  });
});
