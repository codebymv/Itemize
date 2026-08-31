import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as automations from './automationsApi';
import * as email from './emailApi';
import * as adapter from './emailTemplatesGraphql';
import {
  enqueueContactEmailViaGraphql,
  sendEmailTemplateTestViaGraphql,
} from './messageDeliveryGraphql';

vi.mock('./emailTemplatesGraphql', () => ({
  createEmailTemplateViaGraphql: vi.fn(),
  deleteEmailTemplateViaGraphql: vi.fn(),
  duplicateEmailTemplateViaGraphql: vi.fn(),
  getEmailTemplateCategoriesViaGraphql: vi.fn(),
  getEmailTemplateViaGraphql: vi.fn(),
  getEmailTemplatesViaGraphql: vi.fn(),
  updateEmailTemplateViaGraphql: vi.fn(),
}));
vi.mock('./messageDeliveryGraphql', () => ({
  enqueueContactEmailViaGraphql: vi.fn(),
  sendEmailTemplateTestViaGraphql: vi.fn(),
}));

const template = {
  id: 9,
  organization_id: 4,
  name: 'Welcome',
  subject: 'Hello',
  body_html: '<p>Hello</p>',
  variables: [],
  category: 'general',
  is_active: true,
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
};

describe('email-template permanent GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adapter.getEmailTemplatesViaGraphql).mockResolvedValue({
      templates: [template],
      total: 1,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      stats: { total: 1, active: 1, inactive: 0, categories: 1 },
      categories: [{ category: 'general', count: 1 }],
    });
    vi.mocked(adapter.getEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.getEmailTemplateCategoriesViaGraphql).mockResolvedValue({ categories: [] });
    vi.mocked(adapter.createEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.updateEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.duplicateEmailTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.deleteEmailTemplateViaGraphql).mockResolvedValue(undefined);
    vi.mocked(sendEmailTemplateTestViaGraphql).mockResolvedValue({
      success: true,
      message: 'Delivery queued',
      delivery_id: '12',
      status: 'queued',
      replayed: false,
    });
    vi.mocked(enqueueContactEmailViaGraphql).mockResolvedValue({
      success: true,
      message: 'Delivery queued',
      delivery_id: '13',
      status: 'queued',
      replayed: false,
    });
  });

  it('routes both service consumers and all management operations through GraphQL', async () => {
    const createInput = {
      organization_id: 4,
      name: 'Welcome',
      subject: 'Hello',
      body_html: '<p>Hello</p>',
    };
    const updateInput = { organization_id: 4, name: 'Updated' };

    await automations.getEmailTemplates(4, { is_active: true });
    await email.getEmailTemplates(4, { category: 'general' });
    await automations.getEmailTemplate(9, 4);
    await email.getEmailTemplate(9, 4);
    await automations.createEmailTemplate(createInput);
    await automations.updateEmailTemplate(9, updateInput);
    await automations.deleteEmailTemplate(9, 4);
    await email.deleteEmailTemplate(9, 4);
    await automations.duplicateEmailTemplate(9, 4);
    await email.duplicateEmailTemplate(9, 4);
    await automations.getTemplateCategories(4);

    expect(adapter.getEmailTemplatesViaGraphql).toHaveBeenNthCalledWith(1, { is_active: true }, 4);
    expect(adapter.getEmailTemplatesViaGraphql).toHaveBeenNthCalledWith(2, { category: 'general' }, 4);
    expect(adapter.getEmailTemplateViaGraphql).toHaveBeenCalledTimes(2);
    expect(adapter.createEmailTemplateViaGraphql).toHaveBeenCalledWith(createInput, 4);
    expect(adapter.updateEmailTemplateViaGraphql).toHaveBeenCalledWith(9, updateInput, 4);
    expect(adapter.deleteEmailTemplateViaGraphql).toHaveBeenCalledTimes(2);
    expect(adapter.duplicateEmailTemplateViaGraphql).toHaveBeenCalledTimes(2);
    expect(adapter.getEmailTemplateCategoriesViaGraphql).toHaveBeenCalledWith(4);
  });

  it('routes test and contact delivery through the durable GraphQL module', async () => {
    const contactInput = { contact_id: 6, template_id: 9 };

    await email.sendTestEmail(9, 4, 'test@example.com');
    await automations.sendTestEmail(9, 'test@example.com', 4);
    await email.sendEmailToContact(contactInput, 4);

    expect(sendEmailTemplateTestViaGraphql).toHaveBeenNthCalledWith(
      1, 9, 'test@example.com', undefined, 4, false,
    );
    expect(sendEmailTemplateTestViaGraphql).toHaveBeenNthCalledWith(
      2, 9, 'test@example.com', undefined, 4,
    );
    expect(enqueueContactEmailViaGraphql).toHaveBeenCalledWith(contactInput, 4);
  });

  it('rejects a test send without a destination before transport', async () => {
    await expect(email.sendTestEmail(9, 4)).rejects.toThrow(
      'A destination email address is required',
    );
    expect(sendEmailTemplateTestViaGraphql).not.toHaveBeenCalled();
  });
});
