import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import * as sms from './smsApi';
import * as adapter from './smsTemplatesGraphql';
import { isSmsTemplateGraphqlMutationsEnabled, isSmsTemplateGraphqlReadsEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('./smsTemplatesGraphql', () => ({
  getSmsTemplatesViaGraphql: vi.fn(), getSmsTemplateViaGraphql: vi.fn(), createSmsTemplateViaGraphql: vi.fn(),
  updateSmsTemplateViaGraphql: vi.fn(), deleteSmsTemplateViaGraphql: vi.fn(), duplicateSmsTemplateViaGraphql: vi.fn(),
  getSmsTemplateCategoriesViaGraphql: vi.fn(), getSmsMessageInfoViaGraphql: vi.fn(),
}));
vi.mock('./graphqlClient', () => ({ isSmsTemplateGraphqlReadsEnabled: vi.fn(), isSmsTemplateGraphqlMutationsEnabled: vi.fn() }));

const template = { id: 9, organization_id: 4, name: 'Reminder', message: 'Hi', variables: [], category: 'general',
  is_active: true, created_by: 7, created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-21T00:00:00Z' };

describe('SMS-template transport selection', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(isSmsTemplateGraphqlReadsEnabled).mockReturnValue(false); vi.mocked(isSmsTemplateGraphqlMutationsEnabled).mockReturnValue(false); });
  it('keeps management and message info on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { templates: [template], total: 1 } });
    vi.mocked(api.post).mockResolvedValue({ data: { length: 2, segments: 1, encoding: 'GSM', charsRemaining: 158 } });
    await sms.getSmsTemplates(4); await sms.getMessageInfo('Hi');
    expect(api.get).toHaveBeenCalled(); expect(api.post).toHaveBeenCalledWith('/api/sms-templates/message-info', { message: 'Hi' });
  });
  it('routes reads and message info through GraphQL', async () => {
    vi.mocked(isSmsTemplateGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(adapter.getSmsTemplatesViaGraphql).mockResolvedValue({ templates: [template], total: 1 });
    vi.mocked(adapter.getSmsMessageInfoViaGraphql).mockResolvedValue({ length: 2, segments: 1, encoding: 'GSM', charsRemaining: 158 });
    await sms.getSmsTemplates(4); await sms.getMessageInfo('Hi');
    expect(adapter.getSmsTemplatesViaGraphql).toHaveBeenCalledWith(undefined, 4);
    expect(adapter.getSmsMessageInfoViaGraphql).toHaveBeenCalledWith('Hi');
  });
  it('routes CRUD mutations while provider sends stay REST', async () => {
    vi.mocked(isSmsTemplateGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(adapter.createSmsTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(adapter.duplicateSmsTemplateViaGraphql).mockResolvedValue(template);
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await sms.createSmsTemplate({ organization_id: 4, name: 'Reminder', message: 'Hi' });
    await sms.duplicateSmsTemplate(9, 4); await sms.sendTestSms(9, '+16025550100', 4);
    expect(adapter.createSmsTemplateViaGraphql).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/api/sms-templates/9/send-test', { to_phone: '+16025550100', sample_data: undefined }, { headers: { 'x-organization-id': '4' } });
  });
});
