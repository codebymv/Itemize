import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import * as automations from './automationsApi';
import * as email from './emailApi';
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

vi.mock('@/lib/api', () => ({ default: {
  get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
} }));
vi.mock('./emailTemplatesGraphql', () => ({
  createEmailTemplateViaGraphql: vi.fn(),
  deleteEmailTemplateViaGraphql: vi.fn(),
  duplicateEmailTemplateViaGraphql: vi.fn(),
  getEmailTemplateCategoriesViaGraphql: vi.fn(),
  getEmailTemplateViaGraphql: vi.fn(),
  getEmailTemplatesViaGraphql: vi.fn(),
  updateEmailTemplateViaGraphql: vi.fn(),
}));
vi.mock('./graphqlClient', () => ({
  isEmailTemplateGraphqlReadsEnabled: vi.fn(),
  isEmailTemplateGraphqlMutationsEnabled: vi.fn(),
}));

const template = {
  id: 9, organization_id: 4, name: 'Welcome', subject: 'Hello', body_html: '<p>Hello</p>',
  variables: [], category: 'general', is_active: true,
  created_at: '2026-07-20T10:00:00.000Z', updated_at: '2026-07-20T10:00:00.000Z',
};

describe('email-template transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEmailTemplateGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isEmailTemplateGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps both service consumers on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { templates: [template], total: 1 } });
    await automations.getEmailTemplates(4, { is_active: true });
    await email.getEmailTemplates(4, { category: 'general' });
    expect(api.get).toHaveBeenNthCalledWith(1, '/api/email-templates', {
      params: { organization_id: 4, is_active: true },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/email-templates', {
      params: { category: 'general' }, headers: { 'x-organization-id': '4' },
    });
    expect(getEmailTemplatesViaGraphql).not.toHaveBeenCalled();
  });

  it('routes both read consumers and categories through one GraphQL adapter', async () => {
    vi.mocked(isEmailTemplateGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(getEmailTemplatesViaGraphql).mockResolvedValue({ templates: [template], total: 1 });
    vi.mocked(getEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(getEmailTemplateCategoriesViaGraphql).mockResolvedValue({ categories: [] });
    await automations.getEmailTemplates(4);
    await email.getEmailTemplate(9, 4);
    await automations.getTemplateCategories(4);
    expect(getEmailTemplatesViaGraphql).toHaveBeenCalledWith(undefined, 4);
    expect(getEmailTemplateViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(getEmailTemplateCategoriesViaGraphql).toHaveBeenCalledWith(4);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('routes management mutations while provider test sends remain REST', async () => {
    vi.mocked(isEmailTemplateGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(createEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(updateEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(duplicateEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(deleteEmailTemplateViaGraphql).mockResolvedValue(undefined);
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, message: 'sent' } });
    const input = {
      organization_id: 4, name: 'Welcome', subject: 'Hello', body_html: '<p>Hello</p>',
    };
    await automations.createEmailTemplate(input);
    await automations.updateEmailTemplate(9, { organization_id: 4, name: 'Updated' });
    await email.duplicateEmailTemplate(9, 4);
    await email.deleteEmailTemplate(9, 4);
    await email.sendTestEmail(9, 4, 'test@example.com');
    expect(createEmailTemplateViaGraphql).toHaveBeenCalledWith(input, 4);
    expect(updateEmailTemplateViaGraphql).toHaveBeenCalledWith(9, { organization_id: 4, name: 'Updated' }, 4);
    expect(duplicateEmailTemplateViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(deleteEmailTemplateViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(api.post).toHaveBeenCalledWith(
      '/api/email-templates/9/send-test',
      { to_email: 'test@example.com', sample_data: undefined },
      { headers: { 'x-organization-id': '4' } },
    );
  });
});
