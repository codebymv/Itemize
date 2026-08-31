import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sms from './smsApi';
import * as adapter from './smsTemplatesGraphql';
import {
  enqueueContactSmsViaGraphql,
  sendSmsTemplateTestViaGraphql,
} from './messageDeliveryGraphql';

vi.mock('./smsTemplatesGraphql', () => ({
  getSmsTemplatesViaGraphql: vi.fn(),
  getSmsTemplateViaGraphql: vi.fn(),
  createSmsTemplateViaGraphql: vi.fn(),
  updateSmsTemplateViaGraphql: vi.fn(),
  deleteSmsTemplateViaGraphql: vi.fn(),
  duplicateSmsTemplateViaGraphql: vi.fn(),
  getSmsTemplateCategoriesViaGraphql: vi.fn(),
  getSmsMessageInfoViaGraphql: vi.fn(),
}));
vi.mock('./messageDeliveryGraphql', () => ({
  enqueueContactSmsViaGraphql: vi.fn(),
  sendSmsTemplateTestViaGraphql: vi.fn(),
}));

const template = {
  id: 9,
  organization_id: 4,
  name: 'Reminder',
  message: 'Hi',
  variables: [],
  category: 'general',
  is_active: true,
  created_by: 7,
  created_at: '2026-07-21T00:00:00Z',
  updated_at: '2026-07-21T00:00:00Z',
};

describe('SMS-template permanent GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adapter.getSmsTemplatesViaGraphql).mockResolvedValue({
      templates: [template],
      total: 1,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      stats: { total: 1, active: 1, inactive: 0, categories: 1 },
      categories: [{ category: 'general', count: 1 }],
    });
    vi.mocked(adapter.getSmsTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.createSmsTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.updateSmsTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.deleteSmsTemplateViaGraphql).mockResolvedValue({ success: true });
    vi.mocked(adapter.duplicateSmsTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.getSmsTemplateCategoriesViaGraphql).mockResolvedValue([]);
    vi.mocked(adapter.getSmsMessageInfoViaGraphql).mockResolvedValue({
      length: 2, segments: 1, encoding: 'GSM', charsRemaining: 158,
    });
    vi.mocked(sendSmsTemplateTestViaGraphql).mockResolvedValue({
      success: true,
      message: 'Delivery queued',
      delivery_id: '12',
      status: 'queued',
      replayed: false,
    });
    vi.mocked(enqueueContactSmsViaGraphql).mockResolvedValue({
      success: true,
      message: 'Delivery queued',
      delivery_id: '13',
      status: 'queued',
      replayed: false,
    });
  });

  it('delegates all management, helper, and delivery operations to GraphQL', async () => {
    const createInput = { organization_id: 4, name: 'Reminder', message: 'Hi' };
    const updateInput = { organization_id: 4, name: 'Updated' };
    const contactInput = { organization_id: 4, contact_id: 6, template_id: 9 };

    await sms.getSmsTemplates(4, { search: 'reminder' });
    await sms.getSmsTemplate(9, 4);
    await sms.createSmsTemplate(createInput);
    await sms.updateSmsTemplate(9, updateInput);
    await sms.deleteSmsTemplate(9, 4);
    await sms.duplicateSmsTemplate(9, 4);
    await sms.getMessageInfo('Hi');
    await sms.getSmsTemplateCategories(4);
    await sms.sendTestSms(9, '+16025550100', 4);
    await sms.sendSmsToContact(contactInput);

    expect(adapter.getSmsTemplatesViaGraphql).toHaveBeenCalledWith({ search: 'reminder' }, 4);
    expect(adapter.getSmsTemplateViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(adapter.createSmsTemplateViaGraphql).toHaveBeenCalledWith(createInput);
    expect(adapter.updateSmsTemplateViaGraphql).toHaveBeenCalledWith(9, updateInput);
    expect(adapter.deleteSmsTemplateViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(adapter.duplicateSmsTemplateViaGraphql).toHaveBeenCalledWith(9, 4);
    expect(adapter.getSmsMessageInfoViaGraphql).toHaveBeenCalledWith('Hi');
    expect(adapter.getSmsTemplateCategoriesViaGraphql).toHaveBeenCalledWith(4);
    expect(sendSmsTemplateTestViaGraphql).toHaveBeenCalledWith(
      9, '+16025550100', undefined, 4,
    );
    expect(enqueueContactSmsViaGraphql).toHaveBeenCalledWith(contactInput, 4);
  });

  it('rejects a test send without a destination before transport', async () => {
    await expect(sms.sendTestSms(9, 4)).rejects.toThrow('A destination phone number is required');
    expect(sendSmsTemplateTestViaGraphql).not.toHaveBeenCalled();
  });
});
