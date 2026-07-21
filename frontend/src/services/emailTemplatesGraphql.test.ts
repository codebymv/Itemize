import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createEmailTemplateViaGraphql,
  deleteEmailTemplateViaGraphql,
  duplicateEmailTemplateViaGraphql,
  getEmailTemplateCategoriesViaGraphql,
  getEmailTemplateViaGraphql,
  getEmailTemplatesViaGraphql,
  updateEmailTemplateViaGraphql,
} from './emailTemplatesGraphql';
import {
  isEmailTemplateGraphqlMutationsEnabled,
  isEmailTemplateGraphqlReadsEnabled,
} from './graphqlClient';

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
  bodyHtml: '<p>{{company}}</p>',
  bodyText: null,
  variables: ['first_name', 'company'],
  category: 'onboarding',
  isActive: true,
  createdById: 7,
  createdByName: 'Owner',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T11:00:00.000Z',
};

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('email-template GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('template-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and mutation rollout independent and default-off', () => {
    vi.stubEnv('VITE_EMAIL_TEMPLATE_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_EMAIL_TEMPLATE_MUTATIONS_GRAPHQL', 'false');
    expect(isEmailTemplateGraphqlReadsEnabled()).toBe(false);
    expect(isEmailTemplateGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_EMAIL_TEMPLATE_READS_GRAPHQL', 'true');
    expect(isEmailTemplateGraphqlReadsEnabled()).toBe(true);
    expect(isEmailTemplateGraphqlMutationsEnabled()).toBe(false);
  });

  it('walks every page and maps filters and legacy field casing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { emailTemplates: {
        nodes: [template], pageInfo: { total: 2, hasNextPage: true },
      } } }))
      .mockResolvedValueOnce(response({ data: { emailTemplates: {
        nodes: [{ ...template, id: 10, name: 'Follow up' }],
        pageInfo: { total: 2, hasNextPage: false },
      } } }));

    const result = await getEmailTemplatesViaGraphql(
      { category: 'onboarding', is_active: true, search: 'welcome' },
      4,
    );
    expect(result.total).toBe(2);
    expect(result.templates).toHaveLength(2);
    expect(result.templates[0]).toMatchObject({
      id: 9, organization_id: 4, body_html: '<p>{{company}}</p>', is_active: true,
    });
    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies.map((body) => body.variables.page.page)).toEqual([1, 2]);
    expect(bodies[0].variables.filter).toEqual({
      category: 'onboarding', isActive: true, search: 'welcome',
    });
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
    }, 4);
    await updateEmailTemplateViaGraphql(9, { body_text: null, is_active: false }, 4);
    await duplicateEmailTemplateViaGraphql(9, 4);
    await deleteEmailTemplateViaGraphql(9, 4);

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables.input).toEqual({
      name: 'Welcome', subject: 'Hello', bodyHtml: '<p>Hello</p>', isActive: true,
    });
    expect(bodies[1].variables).toEqual({ id: 9, input: { bodyText: null, isActive: false } });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(4);
  });
});
